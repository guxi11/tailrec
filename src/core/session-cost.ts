// Read token usage from Claude's session JSONL after exit
// Strategy: read history.jsonl to locate the session file by sessionId

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { UsageEntry } from "../utils/cost.js";

interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

// ~/.claude/projects/ encodes paths as: /Users/zyy/foo → -Users-zyy-foo
const encodeProjectPath = (projectPath: string): string =>
  "-" + projectPath.slice(1).replace(/\//g, "-");

// Map backend name → ordered list of candidate base dirs
const resolveBaseDirs = (backend: string): string[] => {
  const home = homedir();
  const known = [
    { pattern: /internal/, dir: join(home, ".claude-internal") },
    { pattern: /claude/, dir: join(home, ".claude") },
  ];

  // Put the matching base first, then try the rest
  const primary = known.find((k) => k.pattern.test(backend))?.dir;
  const all = [
    join(home, `.${backend}`),           // exact: ~/.claude-internal, ~/.claude, etc.
    ...known.map((k) => k.dir),          // known locations
    join(home, ".claude-code"),           // future-proof
  ];

  // Dedupe, primary first
  const seen = new Set<string>();
  const result: string[] = [];
  if (primary) { result.push(primary); seen.add(primary); }
  for (const d of all) {
    if (!seen.has(d)) { result.push(d); seen.add(d); }
  }
  return result;
};

// Find session file via history.jsonl — get project path for the sessionId
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
        } catch { /* skip malformed */ }
      }
    } catch { /* can't read history */ }
  }
  return null;
};

// Fallback: brute-force scan projects dirs
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

const parseJSONL = (content: string): { input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number } | null => {
  const usages: ClaudeUsage[] = [];

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      const usage =
        entry?.message?.usage ??
        entry?.usage ??
        entry?.result?.usage;
      if (usage && typeof usage.input_tokens === "number") {
        usages.push(usage);
      }
    } catch { /* skip */ }
  }

  if (usages.length === 0) return null;

  type Acc = { input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number };
  const totals = usages.reduce<Acc>(
    (acc, u) => ({
      input_tokens: acc.input_tokens + u.input_tokens,
      output_tokens: acc.output_tokens + u.output_tokens,
      cache_read_tokens: acc.cache_read_tokens + (u.cache_read_input_tokens ?? 0),
      cache_write_tokens: acc.cache_write_tokens + (u.cache_creation_input_tokens ?? 0),
    }),
    { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 },
  );

  if (totals.input_tokens === 0 && totals.output_tokens === 0) return null;
  return totals;
};

export const readSessionCost = (sessionId: string, model: string, backend = "claude"): UsageEntry | null => {
  try {
    const bases = resolveBaseDirs(backend);
    const file = findViaHistory(sessionId, bases) ?? findByScanning(sessionId, bases);
    if (!file) {
      if (process.env.TAILREC_DEBUG) {
        process.stderr.write(`[tailrec] session not found: ${sessionId} (searched: ${bases.filter(existsSync).join(", ")})\n`);
      }
      return null;
    }

    if (process.env.TAILREC_DEBUG) {
      process.stderr.write(`[tailrec] reading session: ${file}\n`);
    }

    const content = readFileSync(file, "utf-8");
    const result = parseJSONL(content);
    if (!result) return null;

    return { ...result, model, timestamp: new Date().toISOString() };
  } catch {
    return null;
  }
};
