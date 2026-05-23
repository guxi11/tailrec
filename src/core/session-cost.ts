// Read token usage from Claude's session JSONL after exit
// Returns per-iteration granular stats for cost estimation

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { IterationStats } from "../utils/estimate.js";
import { totalContext } from "../utils/estimate.js";

interface RawUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

// ~/.claude/projects/ encodes paths as: /Users/zyy/foo → -Users-zyy-foo
const encodeProjectPath = (projectPath: string): string =>
  "-" + projectPath.slice(1).replace(/\//g, "-");

// Candidate base directories (internal build vs public)
const resolveBaseDirs = (backend: string): string[] => {
  const home = homedir();
  const known = [
    { pattern: /internal/, dir: join(home, ".claude-internal") },
    { pattern: /claude/, dir: join(home, ".claude") },
  ];

  const primary = known.find((k) => k.pattern.test(backend))?.dir;
  const all = [
    join(home, `.${backend}`),
    ...known.map((k) => k.dir),
    join(home, ".claude-code"),
  ];

  const seen = new Set<string>();
  const result: string[] = [];
  if (primary) { result.push(primary); seen.add(primary); }
  for (const d of all) {
    if (!seen.has(d)) { result.push(d); seen.add(d); }
  }
  return result;
};

// Find session file via history.jsonl
const findViaHistory = (sessionId: string, bases: string[]): string | null => {
  for (const base of bases) {
    const historyPath = join(base, "history.jsonl");
    if (!existsSync(historyPath)) continue;

    try {
      const lines = readFileSync(historyPath, "utf-8").split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]!.trim();
        if (!line) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.sessionId === sessionId && entry.project) {
            const encoded = encodeProjectPath(entry.project);
            const candidate = join(base, "projects", encoded, `${sessionId}.jsonl`);
            if (existsSync(candidate)) return candidate;
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
  return null;
};

// Fallback: scan projects dirs
const findByScanning = (sessionId: string, bases: string[]): string | null => {
  const filename = `${sessionId}.jsonl`;
  for (const base of bases) {
    const projectsDir = join(base, "projects");
    if (!existsSync(projectsDir)) continue;
    try {
      for (const project of readdirSync(projectsDir)) {
        const candidate = join(projectsDir, project, filename);
        if (existsSync(candidate)) return candidate;
      }
    } catch { /* skip */ }
  }
  return null;
};

const findSessionFile = (sessionId: string, backend: string): string | null =>  {
  const bases = resolveBaseDirs(backend);
  return findViaHistory(sessionId, bases) ?? findByScanning(sessionId, bases);
};

// Parse JSONL → IterationStats
const parseSessionJSONL = (content: string): IterationStats | null => {
  const messages: { model: string; usage: RawUsage }[] = [];

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      const msg = entry?.message;
      if (!msg?.usage || typeof msg.usage.input_tokens !== "number") continue;
      // Deduplicate: Claude Code sometimes emits the same message twice (streaming + final)
      const prev = messages[messages.length - 1];
      if (prev && prev.usage.input_tokens === msg.usage.input_tokens &&
          prev.usage.output_tokens === msg.usage.output_tokens) continue;
      messages.push({ model: msg.model ?? "unknown", usage: msg.usage });
    } catch { /* skip */ }
  }

  if (messages.length === 0) return null;

  const first = messages[0]!;
  const last = messages[messages.length - 1]!;

  const startContext = totalContext(
    first.usage.input_tokens,
    first.usage.cache_read_input_tokens ?? 0,
    first.usage.cache_creation_input_tokens ?? 0,
  );
  const endContext = totalContext(
    last.usage.input_tokens,
    last.usage.cache_read_input_tokens ?? 0,
    last.usage.cache_creation_input_tokens ?? 0,
  );

  const totals = messages.reduce(
    (acc, m) => ({
      totalInput: acc.totalInput + m.usage.input_tokens,
      totalOutput: acc.totalOutput + m.usage.output_tokens,
      cacheRead: acc.cacheRead + (m.usage.cache_read_input_tokens ?? 0),
      cacheWrite: acc.cacheWrite + (m.usage.cache_creation_input_tokens ?? 0),
    }),
    { totalInput: 0, totalOutput: 0, cacheRead: 0, cacheWrite: 0 },
  );

  return {
    model: first.model,
    startContext,
    endContext,
    ...totals,
    messages: messages.length,
  };
};

export const readSessionStats = (sessionId: string, backend = "claude"): IterationStats | null => {
  try {
    const file = findSessionFile(sessionId, backend);
    if (!file) {
      if (process.env.TAILREC_DEBUG) {
        process.stderr.write(`[tailrec] session not found: ${sessionId}\n`);
      }
      return null;
    }

    if (process.env.TAILREC_DEBUG) {
      process.stderr.write(`[tailrec] reading session: ${file}\n`);
    }

    return parseSessionJSONL(readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
};
