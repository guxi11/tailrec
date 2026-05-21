// Session manager — transparent TTY passthrough to claude

import { spawn } from "node:child_process";
import type { DeckhandConfig } from "../config/index.js";

export interface SessionOptions {
  config: DeckhandConfig;
  appendPrompt: string;
  resume?: boolean;
}

// Spawn claude with full TTY inheritance — deckhand becomes invisible
export const spawnTransparent = (opts: SessionOptions): Promise<number> => {
  const args = buildArgs(opts);

  const proc = spawn("claude", args, {
    stdio: "inherit",
    env: { ...process.env },
  });

  return new Promise((resolve, reject) => {
    proc.on("error", reject);
    proc.on("exit", (code) => resolve(code ?? 0));
  });
};

const buildArgs = (opts: SessionOptions): string[] => {
  const args: string[] = [];

  if (opts.appendPrompt) {
    args.push("--append-system-prompt", opts.appendPrompt);
  }

  if (opts.config.model) {
    args.push("--model", opts.config.model);
  }

  if (opts.resume) {
    args.push("--resume");
  }

  return args;
};
