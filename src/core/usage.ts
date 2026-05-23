// Token/cost tracking

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { UsageEntry } from "../utils/cost.js";
import { calcCost, totalCost, formatCost } from "../utils/cost.js";

export interface AiSession {
  query: string;
  entries: UsageEntry[];
  startedAt: string;
}

export interface SessionUsage {
  entries: UsageEntry[];
  sessions: AiSession[];
  sessionStart: string;
}

const usagePath = (stateDir: string): string => join(stateDir, "usage.json");

export const initSessionUsage = (): SessionUsage => ({
  entries: [],
  sessions: [],
  sessionStart: new Date().toISOString(),
});

export const startAiSession = (usage: SessionUsage, query: string): void => {
  usage.sessions.push({ query, entries: [], startedAt: new Date().toISOString() });
};

export const recordUsage = (session: SessionUsage, entry: UsageEntry): void => {
  session.entries.push(entry);
  // Also record into current AI session if one is active
  const current = session.sessions[session.sessions.length - 1];
  if (current) current.entries.push(entry);
};

export const persistUsage = (stateDir: string, session: SessionUsage): void => {
  const p = usagePath(stateDir);
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Upsert: replace entry with same sessionStart, or append if new
  const existing: SessionUsage[] = existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : [];
  const idx = existing.findIndex((s) => s.sessionStart === session.sessionStart);
  if (idx >= 0) {
    existing[idx] = session;
  } else {
    existing.push(session);
  }
  writeFileSync(p, JSON.stringify(existing, null, 2));
};

export const formatUsageSummary = (session: SessionUsage): string => {
  const { entries } = session;
  if (entries.length === 0) return "No usage recorded this session.";

  const totalIn = entries.reduce((s, e) => s + e.input_tokens, 0);
  const totalOut = entries.reduce((s, e) => s + e.output_tokens, 0);
  const totalCacheRead = entries.reduce((s, e) => s + e.cache_read_tokens, 0);
  const totalCacheWrite = entries.reduce((s, e) => s + e.cache_write_tokens, 0);
  const cost = totalCost(entries);
  const cacheHitRate = totalIn > 0 ? ((totalCacheRead / (totalIn + totalCacheRead)) * 100).toFixed(1) : "0";

  return [
    `Calls: ${entries.length}`,
    `Input: ${totalIn.toLocaleString()} tokens`,
    `Output: ${totalOut.toLocaleString()} tokens`,
    `Cache read: ${totalCacheRead.toLocaleString()} tokens (${cacheHitRate}% hit rate)`,
    `Cache write: ${totalCacheWrite.toLocaleString()} tokens`,
    `Total cost: ${formatCost(cost)}`,
  ].join("\n");
};

export const formatExitSummary = (session: SessionUsage): string => {
  const { sessions } = session;
  if (sessions.length === 0) return "";

  const lines: string[] = [
    `\n\x1b[2m─── tailrec session: ${sessions.length} iteration${sessions.length > 1 ? "s" : ""} ───\x1b[0m`,
  ];

  sessions.forEach((s, i) => {
    const cost = totalCost(s.entries);
    const tokens = s.entries.reduce((sum, e) => sum + e.input_tokens + e.output_tokens, 0);
    const label = s.query.slice(0, 50) + (s.query.length > 50 ? "…" : "");
    if (tokens > 0) {
      lines.push(`\x1b[2m  #${i + 1} ${label} — ${tokens.toLocaleString()} tok, ${formatCost(cost)}\x1b[0m`);
    } else {
      lines.push(`\x1b[2m  #${i + 1} ${label}\x1b[0m`);
    }
  });

  const actualCost = totalCost(session.entries);
  if (actualCost > 0) {
    // Hypothetical O(n²) single-session cost
    let hypotheticalInput = 0;
    let cumulativeContext = 0;
    const totalOutput = session.entries.reduce((s, e) => s + e.output_tokens, 0);
    for (const sess of sessions) {
      const sessInput = sess.entries.reduce((s, e) => s + e.input_tokens, 0);
      const sessOutput = sess.entries.reduce((s, e) => s + e.output_tokens, 0);
      hypotheticalInput += cumulativeContext + sessInput;
      cumulativeContext += sessOutput;
    }
    // Sonnet pricing: $3/Mtok input, $15/Mtok output
    const hypotheticalCost = (hypotheticalInput * 3 + totalOutput * 15) / 1_000_000;
    const savings = hypotheticalCost > 0 ? Math.round((1 - actualCost / hypotheticalCost) * 100) : 0;

    lines.push(`\x1b[2m  Actual: ${formatCost(actualCost)}  │  Single-session estimate: ${formatCost(hypotheticalCost)}  │  Saved: ~${savings}%\x1b[0m`);
  }

  return lines.join("\n");
};

export { calcCost, totalCost, formatCost };
