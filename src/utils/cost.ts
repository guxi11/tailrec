// Pricing table and cost calculation

export interface ModelPricing {
  input_per_mtok: number;
  output_per_mtok: number;
  cache_read_per_mtok: number;
  cache_write_per_mtok: number;
}

const PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-20250514": {
    input_per_mtok: 3,
    output_per_mtok: 15,
    cache_read_per_mtok: 0.3,
    cache_write_per_mtok: 3.75,
  },
  "claude-haiku-4-20250514": {
    input_per_mtok: 0.8,
    output_per_mtok: 4,
    cache_read_per_mtok: 0.08,
    cache_write_per_mtok: 1,
  },
  "claude-opus-4-20250514": {
    input_per_mtok: 15,
    output_per_mtok: 75,
    cache_read_per_mtok: 1.5,
    cache_write_per_mtok: 18.75,
  },
};

export interface UsageEntry {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  timestamp: string;
}

export const calcCost = (entry: UsageEntry): number => {
  const pricing = PRICING[entry.model] ?? PRICING["claude-sonnet-4-20250514"]!;
  return (
    (entry.input_tokens * pricing.input_per_mtok +
      entry.output_tokens * pricing.output_per_mtok +
      entry.cache_read_tokens * pricing.cache_read_per_mtok +
      entry.cache_write_tokens * pricing.cache_write_per_mtok) /
    1_000_000
  );
};

export const totalCost = (entries: UsageEntry[]): number =>
  entries.reduce((sum, e) => sum + calcCost(e), 0);

export const formatCost = (dollars: number): string =>
  dollars < 0.01 ? `$${(dollars * 100).toFixed(2)}¢` : `$${dollars.toFixed(4)}`;
