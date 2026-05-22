// Read token usage from Claude's session JSONL after exit

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { UsageEntry } from "../utils/cost.js";

interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

// Sessions live at ~/.claude/projects/<project-name>/<session-id>.jsonl
const findSessionFile = (sessionId: string): string | null => {
  const projectsDir = join(homedir(), ".claude", "projects");
  if (!existsSync(projectsDir)) return null;

  const filename = `${sessionId}.jsonl`;
  for (const project of readdirSync(projectsDir)) {
    const candidate = join(projectsDir, project, filename);
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

export const readSessionCost = (sessionId: string, model: string): UsageEntry | null => {
  try {
    const file = findSessionFile(sessionId);
    if (!file) return null;

    const content = readFileSync(file, "utf-8");
    const usages: ClaudeUsage[] = [];

    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry?.type === "assistant" && entry?.message?.usage) {
          usages.push(entry.message.usage);
        }
      } catch { /* skip malformed */ }
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

    return { ...totals, model, timestamp: new Date().toISOString() };
  } catch {
    return null;
  }
};
