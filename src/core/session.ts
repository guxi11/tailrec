// Session manager — transparent TTY passthrough with restart loop

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import type { TailrecConfig } from "../config/index.js";

export interface SessionOptions {
  backend: string;
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

// Response marker — Claude Code prefixes responses with ⏺

// Spawn backend inside `script` (allocates a pty so it stays interactive)
// - Suppresses output once signal file appears (restart imminent)
// - Strips new session header up to echoed initialPrompt line
export const spawnTransparent = (opts: SessionOptions): Promise<SpawnResult> => {
  const sessionId = opts.resume ? undefined : (opts.sessionId ?? randomUUID());
  const args = buildArgs(opts, sessionId);

  const isMac = process.platform === "darwin";
  const scriptArgs = isMac
    ? ["-q", "/dev/null", opts.backend, ...args]
    : ["-qc", [opts.backend, ...args].map(a => `'${a.replace(/'/g, "'\\''")}'`).join(" "), "/dev/null"];

  const proc = spawn("script", scriptArgs, {
    stdio: ["inherit", "pipe", "pipe"],
    env: { ...process.env },
  });

  // Once signal file exists, MCP has requested restart — suppress all further output
  let muted = false;
  const isMuted = (): boolean => {
    if (muted) return true;
    if (existsSync(SIGNAL_PATH)) { muted = true; return true; }
    return false;
  };

  // No initialPrompt → passthrough with mute check
  if (!opts.initialPrompt) {
    proc.stdout!.on("data", (chunk: Buffer) => { if (!isMuted()) process.stdout.write(chunk); });
    proc.stderr!.on("data", (chunk: Buffer) => { if (!isMuted()) process.stderr.write(chunk); });
    return new Promise((resolve, reject) => {
      proc.on("error", reject);
      proc.on("exit", (code) => resolve({ exitCode: code ?? 0, sessionId }));
    });
  }

  // Has initialPrompt → strip header until response starts (⏺ marker)
  let headerDone = false;
  let headerBuf = "";

  proc.stdout!.on("data", (chunk: Buffer) => {
    if (isMuted()) return;
    if (headerDone) {
      process.stdout.write(chunk);
      return;
    }
    headerBuf += chunk.toString();
    // Claude Code response starts with ⏺ — strip everything before it
    const markerIdx = headerBuf.indexOf("⏺");
    if (markerIdx !== -1) {
      const afterHeader = headerBuf.slice(markerIdx);
      if (afterHeader) process.stdout.write(afterHeader);
      headerDone = true;
      headerBuf = "";
    }
  });

  proc.stderr!.on("data", (chunk: Buffer) => { if (!isMuted()) process.stderr.write(chunk); });

  return new Promise((resolve, reject) => {
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (!headerDone && !muted && headerBuf) process.stdout.write(headerBuf);
      resolve({ exitCode: code ?? 0, sessionId });
    });
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
