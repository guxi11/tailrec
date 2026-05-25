// MCP tool: t.start — begin executing tasks via tailrec loop
// Finds current task in chain, persists active state, triggers restart

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config/index.js";
import { mergeDecisions, readDecisions } from "../state/index.js";
import { listPlans, findCurrentTask, markDone } from "./tasks.js";

export const handleStart = (args: { plan?: string }): string => {
  const config = loadConfig();
  const specName = process.env["TAILREC_SPEC"] ?? "default";
  const plans = listPlans(config.cards_dir);

  if (plans.length === 0) return "No plans found. Use t.plan first.";

  const planSlug = args.plan ?? plans[0]!;
  const planDir = join(config.cards_dir, "plans", planSlug);
  const current = findCurrentTask(planDir);

  if (!current) return `All tasks in "${planSlug}" are complete!`;

  // Guard: if already executing this exact task, tell LLM to use reassemble instead
  const persisted = readDecisions(config.state_dir, specName);
  if (persisted._active_plan === planSlug && persisted._active_task === current.slug) {
    return `Task "${current.slug}" is already active. If you're done, call reassemble({ next_input: "done" }) to advance.`;
  }

  // Persist active plan/task — repl.ts reads this to build task query and auto-advance
  mergeDecisions(config.state_dir, specName, {
    _active_plan: planSlug,
    _active_task: current.slug,
  });

  // Write restart signal
  const SIGNAL_PATH = process.env["TAILREC_SIGNAL_PATH"];
  if (!SIGNAL_PATH) {
    return `Error: TAILREC_SIGNAL_PATH not set. t.start must run inside a tailrec session.`;
  }

  writeFileSync(SIGNAL_PATH, JSON.stringify({
    action: "start_task",
    query: current.title,
    decisions: { _active_plan: planSlug, _active_task: current.slug },
  }));

  setTimeout(() => process.kill(process.ppid!, "SIGTERM"), 100);
  return `Starting task: ${current.title}\nReassembling with task context...`;
};

// Mark current task as done (called by repl.ts after signal)
export const markTaskDone = (planSlug: string, taskSlug: string): void => {
  const config = loadConfig();
  const taskMdPath = join(config.cards_dir, "plans", planSlug, "tasks", taskSlug, "task.md");
  markDone(taskMdPath);
};
