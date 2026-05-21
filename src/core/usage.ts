// Token/cost tracking

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { UsageEntry } from "../utils/cost.js";
import { calcCost, totalCost, formatCost } from "../utils/cost.js";

export interface SessionUsage {
  entries: UsageEntry[];
  sessionStart: string;
}

const usagePath = (stateDir: string): string => join(stateDir, "usage.json");

export const initSessionUsage = (): SessionUsage => ({
  entries: [],
  sessionStart: new Date().toISOString(),
});

export const recordUsage = (session: SessionUsage, entry: UsageEntry): void => {
  session.entries.push(entry);
};

export const persistUsage = (stateDir: string, session: SessionUsage): void => {
  const p = usagePath(stateDir);
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Append to existing log
  const existing: SessionUsage[] = existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : [];
  existing.push(session);
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

export { calcCost, totalCost, formatCost };
