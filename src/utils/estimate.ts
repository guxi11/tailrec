// Cost estimation: actual (tailrec) vs hypothetical (single-session O(n²))
// Uses exact token counts from session logs including cache behavior

import { getPricingSync, warmPricingCache, formatCost } from "./pricing.js";
import type { ModelPricing } from "./pricing.js";

export interface IterationStats {
  model: string;
  startContext: number;     // total tokens at first message (system + cards + tools)
  endContext: number;       // total tokens at last message (accumulated conversation)
  totalInput: number;       // sum of input_tokens (non-cached)
  totalOutput: number;      // sum of output_tokens
  cacheRead: number;        // sum of cache_read_input_tokens
  cacheWrite: number;       // sum of cache_creation_input_tokens
  messages: number;         // number of assistant messages
}

export interface CostEstimate {
  actual: number;
  hypothetical: number;
  savings: number;          // percentage
  iterations: {
    startContext: number;
    endContext: number;
    contextSaved: number;   // hypothetical_start - actual_start
    cost: number;
  }[];
}

// Total context seen by a message = input_tokens + cache_read + cache_creation
export const totalContext = (input: number, cacheRead: number, cacheWrite: number): number =>
  input + cacheRead + cacheWrite;

const iterationCost = (s: IterationStats, p: ModelPricing): number =>
  (
    s.totalInput * p.input_per_mtok +
    s.totalOutput * p.output_per_mtok +
    s.cacheRead * p.cache_read_per_mtok +
    s.cacheWrite * p.cache_write_per_mtok
  ) / 1_000_000;

export const computeEstimate = (iterations: IterationStats[]): CostEstimate => {
  if (iterations.length === 0) {
    return { actual: 0, hypothetical: 0, savings: 0, iterations: [] };
  }

  const pricing = getPricingSync(iterations[0]!.model);
  let actual = 0;
  let hypothetical = 0;
  let cumulativeOutput = 0;

  const iterResults = iterations.map((iter) => {
    const cost = iterationCost(iter, pricing);
    actual += cost;

    // Hypothetical: in a single session, this iteration starts with baseline + all previous output
    const baseline = iter.startContext;
    const hypotheticalStart = baseline + cumulativeOutput;
    const contextSaved = hypotheticalStart - iter.startContext;

    // Hypothetical cost: same output, but each message carries extra accumulated context
    // at full input price (no cache benefit from fresh reassembly)
    const extraInputTokens = cumulativeOutput * iter.messages;
    const hypotheticalIterCost = cost + (extraInputTokens * pricing.input_per_mtok) / 1_000_000;
    hypothetical += hypotheticalIterCost;

    cumulativeOutput += iter.totalOutput;

    return { startContext: iter.startContext, endContext: iter.endContext, contextSaved, cost };
  });

  const savings = hypothetical > 0 ? Math.round((1 - actual / hypothetical) * 100) : 0;

  return { actual, hypothetical, savings, iterations: iterResults };
};

export const formatEstimate = async (iterations: IterationStats[]): Promise<string> => {
  if (iterations.length === 0) return "";

  // Ensure pricing is loaded before computing
  await warmPricingCache();

  const est = computeEstimate(iterations);
  const lines: string[] = [];
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

  lines.push(dim(`─── tailrec: ${iterations.length} iteration${iterations.length > 1 ? "s" : ""} ───`));

  iterations.forEach((iter, i) => {
    const r = est.iterations[i]!;
    const saved = r.contextSaved > 0 ? ` (−${(r.contextSaved / 1000).toFixed(1)}k ctx)` : "";
    lines.push(dim(
      `  #${i + 1} ${iter.startContext.toLocaleString()}→${iter.endContext.toLocaleString()} tok` +
      `  ${iter.messages} msg  ${formatCost(r.cost)}${saved}`,
    ));
  });

  if (est.actual > 0) {
    lines.push(dim(
      `  Actual: ${formatCost(est.actual)}  │  No-tailrec est: ${formatCost(est.hypothetical)}  │  Saved: ~${est.savings}%`,
    ));
  }

  return lines.join("\n");
};
