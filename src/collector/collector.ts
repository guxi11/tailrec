// Collector orchestration — spawns backend -p to select relevant cards

import { spawn } from "node:child_process";
import type { Card } from "../cards/index.js";
import { COLLECTOR_SYSTEM_PROMPT, buildCollectorUserPrompt } from "./prompts.js";

export interface CollectorResult {
  selectedCards: string[];
}

export const collect = async (args: {
  nextInput: string;
  contextHints?: string[];
  cards: Card[];
  model: string;
  backend: string;
}): Promise<CollectorResult> => {
  const { nextInput, contextHints, cards, model, backend } = args;

  if (cards.length === 0 || !nextInput) return { selectedCards: [] };

  const cardIndex = cards.map((c) => ({
    name: c.name,
    description: c.frontmatter.description ?? "",
    links: c.links,
  }));

  const prompt = `${COLLECTOR_SYSTEM_PROMPT}\n\n${buildCollectorUserPrompt({ nextInput, contextHints, cardIndex })}`;

  const text = await runBackendPrint(backend, model, prompt);
  const clean = stripAnsi(text);
  // Match a JSON array containing strings
  const match = clean.match(/\[\s*"[\s\S]*?\]/);
  if (!match) return { selectedCards: [] };
  try {
    return { selectedCards: JSON.parse(match[0]) };
  } catch {
    throw new Error(`collector returned invalid JSON: ${clean}`);
  }
};

// Strip ANSI escape sequences and terminal control codes from PTY output
const stripAnsi = (s: string): string =>
  s.replace(/\x1b\[[^a-zA-Z]*[a-zA-Z]/g, "")
   .replace(/\x1b\][^\x07]*\x07/g, "")
   .replace(/\x1b[()][A-Z0-9]/g, "")
   .replace(/[\x00-\x08\x0e-\x1f]/g, "");

const runBackendPrint = (backend: string, model: string, prompt: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const isMac = process.platform === "darwin";
    const args = ["-p", prompt, "--model", model];

    // Wrap in `script` to allocate a PTY (claude-internal requires it)
    const scriptArgs = isMac
      ? ["-q", "/dev/null", backend, ...args]
      : ["-qc", [backend, ...args].map(a => `'${a.replace(/'/g, "'\\''")}'`).join(" "), "/dev/null"];

    const proc = spawn("script", scriptArgs, {
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout!.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr!.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    const timeout = parseInt(process.env.COLLECTOR_TIMEOUT_MS || "120000");
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`collector timed out after ${timeout / 1000}s\nstdout: ${stdout}\nstderr: ${stderr}`));
    }, timeout);

    proc.on("error", (e) => { clearTimeout(timer); reject(e); });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`${backend} -p exited ${code}: ${stderr}`));
      else resolve(stdout.trim());
    });
  });
