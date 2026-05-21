// Launch claude transparently with assembled card context

import type { DeckhandConfig } from "../config/index.js";
import { reassemble } from "../core/reassemble.js";
import { spawnTransparent } from "../core/session.js";
import { initSessionUsage, persistUsage } from "../core/usage.js";

export const startSession = async (
  config: DeckhandConfig,
  opts?: { spec?: string; resume?: boolean },
): Promise<void> => {
  const specName = opts?.spec ?? "default";
  const sessionUsage = initSessionUsage();

  // Assemble card context via collector
  const result = await reassemble(
    { next_input: "general session" },
    config,
    specName,
    sessionUsage,
  );

  // Hand off to claude — full TUI, no parsing
  const exitCode = await spawnTransparent({
    config,
    appendPrompt: result.prompt.appendix,
    resume: opts?.resume,
  });

  persistUsage(config.state_dir, sessionUsage);
  process.exit(exitCode);
};
