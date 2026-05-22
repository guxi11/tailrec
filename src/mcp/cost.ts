// MCP tool: t.cost — show actual tailrec cost + hypothetical single-session cost
// This is a wrapper command — pure local computation, no LLM call

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config/index.js";
import { formatCost } from "../utils/cost.js";
import type { UsageEntry } from "../utils/cost.js";
import { totalCost } from "../utils/cost.js";

export const handleCost = (_args: Record<string, never>): string => {
  const config = loadConfig();
  const usagePath = join(config.state_dir, "usage.json");

  if (!existsSync(usagePath)) return "No usage data yet.";

  const sessions = JSON.parse(readFileSync(usagePath, "utf-8")) as Array<{
    entries: UsageEntry[];
    sessions: Array<{ query: string; entries: UsageEntry[] }>;
    sessionStart: string;
  }>;

  if (sessions.length === 0) return "No usage data yet.";

  // Actual tailrec cost: sum of all entries across all sessions
  const allEntries = sessions.flatMap((s) => s.entries);
  const actualCost = totalCost(allEntries);
  const totalInputTokens = allEntries.reduce((s, e) => s + e.input_tokens, 0);
  const totalOutputTokens = allEntries.reduce((s, e) => s + e.output_tokens, 0);
  const totalIterations = sessions.flatMap((s) => s.sessions).length;

  // Hypothetical single-session cost: O(n²) cumulative input tokens
  // Each iteration in a single session sees ALL previous output as context
  // Simulation: for n iterations, iteration i sees sum of outputs[0..i-1] as input
  const iterationSessions = sessions.flatMap((s) => s.sessions);
  let hypotheticalInput = 0;
  let cumulativeContext = 0;
  for (const sess of iterationSessions) {
    const sessOutput = sess.entries.reduce((s, e) => s + e.output_tokens, 0);
    hypotheticalInput += cumulativeContext + sess.entries.reduce((s, e) => s + e.input_tokens, 0);
    cumulativeContext += sessOutput;
  }

  // Use sonnet pricing for hypothetical cost
  const hypotheticalCost = (hypotheticalInput * 3 + totalOutputTokens * 15) / 1_000_000;

  const savings = hypotheticalCost > 0 ? ((1 - actualCost / hypotheticalCost) * 100).toFixed(0) : "0";

  return [
    `── Tailrec Cost Summary ──`,
    ``,
    `Actual (tailrec):`,
    `  Iterations: ${totalIterations}`,
    `  Input tokens: ${totalInputTokens.toLocaleString()}`,
    `  Output tokens: ${totalOutputTokens.toLocaleString()}`,
    `  Cost: ${formatCost(actualCost)}`,
    ``,
    `Hypothetical (single session, O(n²)):`,
    `  Input tokens: ${hypotheticalInput.toLocaleString()}`,
    `  Cost: ${formatCost(hypotheticalCost)}`,
    ``,
    `Savings: ~${savings}%`,
  ].join("\n");
};
