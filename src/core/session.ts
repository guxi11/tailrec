// Session manager — transparent TTY passthrough with restart loop

import { spawn } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import type { DeckhandConfig } from "../config/index.js";

export interface SessionOptions {
  config: DeckhandConfig;
  appendPrompt: string;
  resume?: boolean;
}

export interface RestartSignal {
  action: "restart";
  query: string;
  decisions?: Record<string, unknown>;
  contextHints?: string[];
}

const SIGNAL_DIR = join(tmpdir(), "deckhand");
const SIGNAL_PATH = join(SIGNAL_DIR, "signal.json");

const getMcpBin = (): string => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return resolve(__dirname, "mcp.js");
};

const writeMcpConfig = (): string => {
  if (!existsSync(SIGNAL_DIR)) mkdirSync(SIGNAL_DIR, { recursive: true });

  const configPath = join(SIGNAL_DIR, "mcp.json");
  const mcpBin = getMcpBin();

  writeFileSync(configPath, JSON.stringify({
    mcpServers: {
      deckhand: {
        command: "node",
        args: [mcpBin],
        env: { DECKHAND_SIGNAL_PATH: SIGNAL_PATH },
      },
    },
  }));

  return configPath;
};

export const readRestartSignal = (): RestartSignal | null => {
  if (!existsSync(SIGNAL_PATH)) return null;
  try {
    const data = JSON.parse(readFileSync(SIGNAL_PATH, "utf-8"));
    unlinkSync(SIGNAL_PATH);
    return data;
  } catch {
    return null;
  }
};

// Spawn claude with full TTY inheritance
export const spawnTransparent = (opts: SessionOptions): Promise<number> => {
  const args = buildArgs(opts);

  const proc = spawn(opts.config.backend, args, {
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

  // Inject MCP server for deckhand tools
  const mcpConfig = writeMcpConfig();
  args.push("--mcp-config", mcpConfig);

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
