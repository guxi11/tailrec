// Launch backend transparently with card context — restart loop on signal

import type { TailrecConfig } from "../config/index.js";
import { reassemble } from "../core/reassemble.js";
import { spawnTransparent, readRestartSignal } from "../core/session.js";
import { readSessionStats } from "../core/session-cost.js";
import { runBridge } from "../core/bridge.js";
import { markTaskDone } from "../mcp/start.js";
import type { IterationStats } from "../utils/estimate.js";
import { formatEstimate } from "../utils/estimate.js";
import { warmPricingCache } from "../utils/pricing.js";

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

  // Restart loop — respawn backend when MCP signals restart
  while (true) {
    const result = await reassemble(
      { next_input: query },
      config,
      specName,
    );

    const { exitCode, sessionId } = await spawnTransparent({
      backend,
      config,
      appendPrompt: result.prompt.appendix,
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
      // If a plan task just completed, run the bridge
      const activePlan = signal.decisions?._active_plan as string | undefined;
      const activeTask = signal.decisions?._active_task as string | undefined;

      if (activePlan && activeTask) {
        markTaskDone(activePlan, activeTask);

        // Run inter-session bridge: small model → input.md for next task
        try {
          await runBridge(
            {
              completedTask: activeTask,
              nextTask: signal.query,
              sessionSummary: JSON.stringify(signal.decisions ?? {}),
              planSlug: activePlan,
            },
            config,
          );
        } catch { /* bridge failure is non-fatal */ }
      }

      query = signal.query;
      resume = false;
      continue;
    }

    // Normal exit — show cost estimate
    const summary = await formatEstimate(iterations);
    if (summary) process.stderr.write(summary + "\n");
    process.exit(exitCode);
  }
};
