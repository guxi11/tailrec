// Launch claude transparently with card context — restart loop on signal

import type { DeckhandConfig } from "../config/index.js";
import { reassemble } from "../core/reassemble.js";
import { spawnTransparent, readRestartSignal } from "../core/session.js";
import { initSessionUsage, startAiSession, persistUsage, formatExitSummary } from "../core/usage.js";

export const startSession = async (
  config: DeckhandConfig,
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

    const exitCode = await spawnTransparent({
      config,
      appendPrompt: result.prompt.appendix,
      resume,
      initialPrompt: query,
    });

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
