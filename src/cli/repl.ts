// Launch backend transparently with card context — restart loop on signal

import type { TailrecConfig } from "../config/index.js";
import { reassemble } from "../core/reassemble.js";
import { spawnTransparent, readRestartSignal } from "../core/session.js";
import { initSessionUsage, startAiSession, recordUsage, persistUsage, formatExitSummary } from "../core/usage.js";
import { readSessionCost } from "../core/session-cost.js";
import { runBridge } from "../core/bridge.js";
import { markTaskDone } from "../mcp/start.js";
import type { UsageEntry } from "../utils/cost.js";

export const startSession = async (
  backend: string,
  config: TailrecConfig,
  opts?: { spec?: string; resume?: boolean; task?: string },
): Promise<void> => {
  const specName = opts?.spec ?? "default";
  const sessionUsage = initSessionUsage();

  let query = opts?.task ?? "";
  let resume = opts?.resume;

  // Restart loop — respawn backend when MCP signals restart
  while (true) {
    startAiSession(sessionUsage, query);

    const result = await reassemble(
      { next_input: query },
      config,
      specName,
      sessionUsage,
    );

    const { exitCode, sessionId } = await spawnTransparent({
      backend,
      config,
      appendPrompt: result.prompt.appendix,
      resume,
      initialPrompt: query,
    });

    // Read actual session cost from JSONL
    if (sessionId) {
      const entry = readSessionCost(sessionId, "claude-sonnet-4-20250514", backend);
      if (entry) recordUsage(sessionUsage, entry);
    }

    // Persist usage incrementally so t.cost MCP tool sees current data
    persistUsage(config.state_dir, sessionUsage);

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
          const bridgeResult = await runBridge(
            {
              completedTask: activeTask,
              nextTask: signal.query,
              sessionSummary: JSON.stringify(signal.decisions ?? {}),
              planSlug: activePlan,
            },
            config,
          );

          const bridgeEntry: UsageEntry = {
            model: config.bridge_model,
            input_tokens: bridgeResult.usage.input_tokens,
            output_tokens: bridgeResult.usage.output_tokens,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            timestamp: new Date().toISOString(),
          };
          recordUsage(sessionUsage, bridgeEntry);
        } catch { /* bridge failure is non-fatal */ }
      }

      query = signal.query;
      resume = false;
      continue;
    }

    // Normal exit — show usage then persist
    const summary = formatExitSummary(sessionUsage);
    if (summary) process.stderr.write(summary + "\n");
    persistUsage(config.state_dir, sessionUsage);
    process.exit(exitCode);
  }
};
