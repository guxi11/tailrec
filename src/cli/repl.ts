// Launch backend transparently with card context — restart loop on signal

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { TailrecConfig } from "../config/index.js";
import { reassemble } from "../core/reassemble.js";
import { spawnTransparent, readRestartSignal } from "../core/session.js";
import { readSessionStats } from "../core/session-cost.js";
import { runBridge } from "../core/bridge.js";
import { markTaskDone } from "../mcp/start.js";
import { findCurrentTask } from "../mcp/tasks.js";
import { mergeDecisions, readDecisions } from "../state/index.js";
import type { IterationStats } from "../utils/estimate.js";
import { formatEstimate } from "../utils/estimate.js";
import { warmPricingCache } from "../utils/pricing.js";

// Build execution query for the current task in a plan's chain
const buildTaskQuery = (config: TailrecConfig, planSlug: string): { query: string; taskSlug: string } | null => {
  const planDir = join(config.cards_dir, "plans", planSlug);
  const current = findCurrentTask(planDir);
  if (!current) return null;

  // Read design.md
  const designPath = join(planDir, "design.md");
  const designRaw = existsSync(designPath) ? readFileSync(designPath, "utf-8") : "";
  const designBody = designRaw.replace(/^---[\s\S]*?---\s*/, "").trim();

  // Read handoff from bridge (input.md)
  const taskDir = join(planDir, "tasks", current.slug);
  const inputPath = join(taskDir, "input.md");
  const handoffRaw = existsSync(inputPath) ? readFileSync(inputPath, "utf-8") : "";
  const handoff = handoffRaw.replace(/^---[\s\S]*?---\s*/, "").trim();

  const query = [
    `## Task: ${current.title}`,
    current.spec ? `\n## Task Spec\n${current.spec}` : "",
    designBody ? `\n## Design Constraints\n${designBody}` : "",
    handoff ? `\n## Handoff from previous task\n${handoff}` : "",
    `\n## Scope Boundary (STRICT)`,
    `Implement ONLY "${current.title}". Do NOT proceed to other tasks.`,
    `When done: call \`reassemble({ next_input: "done" })\` OR simply finish and exit.`,
    `If the task is ALREADY IMPLEMENTED: call \`reassemble({ next_input: "done" })\` immediately. Do NOT skip the reassemble call.`,
    `Tailrec will auto-advance to the next task. Working beyond this boundary is forbidden.`,
  ].filter(Boolean).join("\n");

  return { query, taskSlug: current.slug };
};

// Stuck detection: if the same task is assigned repeatedly without completion, force-advance
const MAX_TASK_ATTEMPTS = 2;

const checkAndAdvanceStuck = (
  config: TailrecConfig,
  specName: string,
  planSlug: string,
  taskSlug: string,
): { advanced: boolean; next: ReturnType<typeof buildTaskQuery> } => {
  const decisions = readDecisions(config.state_dir, specName);
  const attempts = (decisions._task_attempts as number) ?? 0;
  const lastTask = decisions._task_attempt_slug as string | undefined;

  // Reset counter if task changed (0 = not yet attempted)
  if (lastTask !== taskSlug) {
    mergeDecisions(config.state_dir, specName, {
      _task_attempts: 0,
      _task_attempt_slug: taskSlug,
    });
    return { advanced: false, next: null };
  }

  const newAttempts = attempts + 1;
  mergeDecisions(config.state_dir, specName, { _task_attempts: newAttempts });

  if (newAttempts >= MAX_TASK_ATTEMPTS) {
    // Stuck — force mark done and advance
    process.stderr.write(
      `\x1b[33m[tailrec] task "${taskSlug}" stuck (${newAttempts} attempts) — force-advancing\x1b[0m\n`,
    );
    markTaskDone(planSlug, taskSlug);
    mergeDecisions(config.state_dir, specName, {
      _task_attempts: 0,
      _task_attempt_slug: null,
    });
    const next = buildTaskQuery(config, planSlug);
    return { advanced: true, next };
  }

  return { advanced: false, next: null };
};

export const startSession = async (
  backend: string,
  config: TailrecConfig,
  opts?: { spec?: string; resume?: boolean; task?: string },
): Promise<void> => {
  const specName = opts?.spec ?? "default";
  const iterations: IterationStats[] = [];

  // Pre-warm pricing cache in background (non-blocking)
  warmPricingCache().catch(() => {});

  let query = opts?.task ?? "";
  let resume = opts?.resume;

  const showCostAndExit = async (code: number): Promise<never> => {
    const summary = await formatEstimate(iterations);
    if (summary) process.stderr.write(summary + "\n");
    process.exit(code);
  };

  // Restart loop — respawn backend when MCP signals restart
  try {
  while (true) {
    // Stuck detection: before spawning, check if current task has been retried too many times
    const preDecisions = readDecisions(config.state_dir, specName);
    const prePlan = preDecisions._active_plan as string | undefined;
    const preTask = preDecisions._active_task as string | undefined;
    if (prePlan && preTask) {
      const stuck = checkAndAdvanceStuck(config, specName, prePlan, preTask);
      if (stuck.advanced) {
        if (stuck.next) {
          mergeDecisions(config.state_dir, specName, {
            _active_plan: prePlan,
            _active_task: stuck.next.taskSlug,
          });
          query = stuck.next.query;
        } else {
          mergeDecisions(config.state_dir, specName, {
            _active_plan: null,
            _active_task: null,
          });
          await showCostAndExit(0);
        }
        resume = false;
        continue;
      }
    }

    const result = await reassemble(
      { next_input: query },
      config,
      specName,
      backend,
    );

    const { exitCode, sessionId } = await spawnTransparent({
      backend,
      config,
      appendPrompt: result.prompt.appendix,
      specName,
      resume,
      initialPrompt: query,
    });

    // Collect per-iteration stats from session JSONL
    if (sessionId) {
      const stats = readSessionStats(sessionId, backend);
      if (stats) iterations.push(stats);
    }

    // Check for restart signal from MCP
    const signal = readRestartSignal();
    if (signal) {
      // Erase trailing TUI frame left by killed session
      process.stdout.write("\x1b[1F\x1b[J");

      const activePlan = signal.decisions?._active_plan as string | undefined;
      const activeTask = signal.decisions?._active_task as string | undefined;

      if (signal.action === "start_task" && activePlan) {
        const result = buildTaskQuery(config, activePlan);
        query = result?.query ?? signal.query;
      } else if (activePlan && activeTask) {
        // reassemble called by LLM after task work — mark done and advance
        markTaskDone(activePlan, activeTask);
        // Reset stuck counter on successful completion
        mergeDecisions(config.state_dir, specName, {
          _task_attempts: 0,
          _task_attempt_slug: null,
        });

        // Find next task FIRST so bridge can write to the correct directory
        const next = buildTaskQuery(config, activePlan);

        // Run inter-session bridge if there's a next task
        if (next) {
          try {
            await runBridge(
              {
                completedTask: activeTask,
                nextTaskSlug: next.taskSlug,
                sessionSummary: JSON.stringify(signal.decisions ?? {}),
                planSlug: activePlan,
              },
              config,
              backend,
            );
          } catch { /* bridge failure is non-fatal */ }
        }

        // Auto-advance: follow the chain to next task
        if (next) {
          mergeDecisions(config.state_dir, specName, {
            _active_plan: activePlan,
            _active_task: next.taskSlug,
          });
          query = next.query;
        } else {
          // All tasks done — clear active state
          mergeDecisions(config.state_dir, specName, {
            _active_plan: null,
            _active_task: null,
          });
          query = signal.query || "All plan tasks complete.";
        }
      } else {
        // Non-plan reassemble — use signal query as-is
        query = signal.query;
      }

      resume = false;
      continue;
    }

    // No signal — check if plan is active and auto-advance
    const persisted = readDecisions(config.state_dir, specName);
    const activePlan = persisted._active_plan as string | undefined;
    const activeTask = persisted._active_task as string | undefined;

    if (activePlan && activeTask) {
      // Backend exited without calling reassemble — enforce task boundary
      process.stderr.write(`\x1b[33m[tailrec] auto-advancing: task "${activeTask}" → next\x1b[0m\n`);
      markTaskDone(activePlan, activeTask);
      // Reset stuck counter on successful completion
      mergeDecisions(config.state_dir, specName, {
        _task_attempts: 0,
        _task_attempt_slug: null,
      });

      // Find next task FIRST so bridge can write to the correct directory
      const next = buildTaskQuery(config, activePlan);

      if (next) {
        try {
          await runBridge(
            {
              completedTask: activeTask,
              nextTaskSlug: next.taskSlug,
              sessionSummary: "",
              planSlug: activePlan,
            },
            config,
            backend,
          );
        } catch { /* bridge failure is non-fatal */ }

        mergeDecisions(config.state_dir, specName, {
          _active_plan: activePlan,
          _active_task: next.taskSlug,
        });
        query = next.query;
      } else {
        mergeDecisions(config.state_dir, specName, {
          _active_plan: null,
          _active_task: null,
        });
        // All tasks done — exit
        await showCostAndExit(exitCode);
      }
      resume = false;
      continue;
    }

    // Normal exit (no active plan) — show cost estimate
    await showCostAndExit(exitCode);
  }
  } catch (err) {
    // Ensure cost is always displayed even on unexpected crash
    const summary = await formatEstimate(iterations);
    if (summary) process.stderr.write(summary + "\n");
    throw err;
  }
};
