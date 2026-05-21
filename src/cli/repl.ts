// Launch claude transparently with card context — restart loop on signal

import type { DeckhandConfig } from "../config/index.js";
import { reassemble } from "../core/reassemble.js";
import { spawnTransparent, readRestartSignal } from "../core/session.js";
import { initSessionUsage, persistUsage } from "../core/usage.js";

export const startSession = async (
  config: DeckhandConfig,
  opts?: { spec?: string; resume?: boolean },
): Promise<void> => {
  const specName = opts?.spec ?? "default";
  const sessionUsage = initSessionUsage();

  let query = "general session";
  let resume = opts?.resume;

  // Restart loop — respawn claude when MCP signals restart
  while (true) {
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
    });

    // Check for restart signal from MCP
    const signal = readRestartSignal();
    if (signal) {
      query = signal.query;
      resume = false; // fresh session on restart
      continue;
    }

    // Normal exit
    persistUsage(config.state_dir, sessionUsage);
    process.exit(exitCode);
  }
};
