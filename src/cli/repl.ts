// Launch claude transparently with card context — restart loop on signal

import type { TailrecConfig } from "../config/index.js";
import { reassemble } from "../core/reassemble.js";
import { spawnTransparent, readRestartSignal } from "../core/session.js";
import { initSessionUsage, startAiSession, recordUsage, persistUsage, formatExitSummary } from "../core/usage.js";
import { readSessionCost } from "../core/session-cost.js";

export const startSession = async (
  config: TailrecConfig,
  opts?: { spec?: string; resume?: boolean; task?: string },
): Promise<void> => {
  const specName = opts?.spec ?? "default";
  const sessionUsage = initSessionUsage();

  let query = opts?.task ?? "";
  let resume = opts?.resume;

  // Restart loop — respawn claude when MCP signals restart
  while (true) {
    startAiSession(sessionUsage, query);

    const result = await reassemble(
      { next_input: query },
      config,
      specName,
      sessionUsage,
    );

    const { exitCode, sessionId } = await spawnTransparent({
      config,
      appendPrompt: result.prompt.appendix,
      resume,
      initialPrompt: query,
    });

    // Read actual claude session cost from JSONL
    if (sessionId) {
      const model = config.model ?? "claude-sonnet-4-20250514";
      const entry = readSessionCost(sessionId, model);
      if (entry) recordUsage(sessionUsage, entry);
    }

    // Check for restart signal from MCP
    const signal = readRestartSignal();
    if (signal) {
      query = signal.query;
      resume = false; // fresh session on restart
      continue;
    }

    // Normal exit — show usage then persist
    const summary = formatExitSummary(sessionUsage);
    if (summary) process.stderr.write(summary + "\n");
    persistUsage(config.state_dir, sessionUsage);
    process.exit(exitCode);
  }
};
