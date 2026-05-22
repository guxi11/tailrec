// Session manager — transparent TTY passthrough with restart loop

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import type { TailrecConfig } from "../config/index.js";

export interface SessionOptions {
  config: TailrecConfig;
  appendPrompt: string;
  resume?: boolean;
  initialPrompt?: string;
  sessionId?: string;
}

export interface SpawnResult {
  exitCode: number;
  sessionId: string | undefined;
}

export interface RestartSignal {
  action: "restart";
  query: string;
  decisions?: Record<string, unknown>;
  contextHints?: string[];
}

const SIGNAL_DIR = join(tmpdir(), "tailrec");
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
      tailrec: {
        command: "node",
        args: [mcpBin],
        env: { TAILREC_SIGNAL_PATH: SIGNAL_PATH },
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

// Clear claude's startup header by restoring pre-spawn cursor position
const clearHeader = (delayMs = 300): void => {
  process.stdout.write("\x1B7"); // save cursor before header
  setTimeout(() => {
    process.stdout.write("\x1B8\x1B[J"); // restore cursor + clear below
  }, delayMs);
};

// Spawn claude with full TTY inheritance
export const spawnTransparent = (opts: SessionOptions): Promise<SpawnResult> => {
  const sessionId = opts.resume ? undefined : (opts.sessionId ?? randomUUID());
  const args = buildArgs(opts, sessionId);

  clearHeader();

  const proc = spawn(opts.config.backend, args, {
    stdio: "inherit",
    env: { ...process.env },
  });

  return new Promise((resolve, reject) => {
    proc.on("error", reject);
    proc.on("exit", (code) => resolve({ exitCode: code ?? 0, sessionId }));
  });
};

const buildArgs = (opts: SessionOptions, sessionId: string | undefined): string[] => {
  const args: string[] = [];

  // Inject MCP server for tailrec tools
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
  } else if (sessionId) {
    args.push("--session-id", sessionId);
  }

  if (opts.initialPrompt) {
    args.push(opts.initialPrompt);
  }

  return args;
};
