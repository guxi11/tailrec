// Dynamic pricing from LiteLLM's model_prices_and_context_window.json
// Strategy: fetch → local cache (24h TTL) → hardcoded fallback

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface ModelPricing {
  input_per_mtok: number;
  output_per_mtok: number;
  cache_read_per_mtok: number;
  cache_write_per_mtok: number;
}

interface LiteLLMEntry {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;
  cache_creation_input_token_cost?: number;
  litellm_provider?: string;
}

const LITELLM_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const CACHE_DIR = join(homedir(), ".tailrec");
const CACHE_FILE = join(CACHE_DIR, "pricing.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Hardcoded fallback (USD per million tokens)
const FALLBACK: Record<string, ModelPricing> = {
  opus:   { input_per_mtok: 15, output_per_mtok: 75, cache_read_per_mtok: 1.5, cache_write_per_mtok: 18.75 },
  sonnet: { input_per_mtok: 3, output_per_mtok: 15, cache_read_per_mtok: 0.3, cache_write_per_mtok: 3.75 },
  haiku:  { input_per_mtok: 0.8, output_per_mtok: 4, cache_read_per_mtok: 0.08, cache_write_per_mtok: 1 },
};

// Convert LiteLLM per-token cost → per-million-token cost
const toLitePricing = (entry: LiteLLMEntry): ModelPricing | null => {
  if (!entry.input_cost_per_token || !entry.output_cost_per_token) return null;
  return {
    input_per_mtok: entry.input_cost_per_token * 1_000_000,
    output_per_mtok: entry.output_cost_per_token * 1_000_000,
    cache_read_per_mtok: (entry.cache_read_input_token_cost ?? entry.input_cost_per_token * 0.1) * 1_000_000,
    cache_write_per_mtok: (entry.cache_creation_input_token_cost ?? entry.input_cost_per_token * 1.25) * 1_000_000,
  };
};

// Cache management
const isCacheFresh = (): boolean => {
  if (!existsSync(CACHE_FILE)) return false;
  try {
    const mtime = statSync(CACHE_FILE).mtimeMs;
    return Date.now() - mtime < CACHE_TTL_MS;
  } catch { return false; }
};

const readCache = (): Record<string, LiteLLMEntry> | null => {
  if (!existsSync(CACHE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
  } catch { return null; }
};

const writeCache = (data: Record<string, LiteLLMEntry>): void => {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(data));
  } catch { /* non-fatal */ }
};

// Fetch pricing data (non-blocking best-effort)
const fetchPricing = async (): Promise<Record<string, LiteLLMEntry> | null> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(LITELLM_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json() as Record<string, LiteLLMEntry>;
    writeCache(data);
    return data;
  } catch { return null; }
};

// Load pricing data: fresh cache → fetch → stale cache → null
const loadPricingData = async (): Promise<Record<string, LiteLLMEntry> | null> => {
  if (isCacheFresh()) return readCache();
  const fetched = await fetchPricing();
  if (fetched) return fetched;
  return readCache(); // stale cache better than nothing
};

// Resolve model name from session log to LiteLLM key
// Session log: "claude-4.6-opus", "claude-sonnet-4-20250514", etc.
// LiteLLM keys: "claude-opus-4-20250514", "claude-3-5-haiku-20241022", etc.
const resolveModel = (model: string, data: Record<string, LiteLLMEntry>): LiteLLMEntry | null => {
  // Try exact match first
  if (data[model]) return data[model]!;

  // Try with provider prefix
  const withPrefix = `anthropic/${model}`;
  if (data[withPrefix]) return data[withPrefix]!;

  // Fuzzy: find best match by tier name + Anthropic provider
  const lower = model.toLowerCase();
  const tier = lower.includes("opus") ? "opus"
    : lower.includes("haiku") ? "haiku"
    : lower.includes("sonnet") ? "sonnet"
    : null;

  if (!tier) return null;

  // Find all Anthropic models matching this tier, pick the most recent
  const candidates = Object.entries(data)
    .filter(([key, entry]) =>
      key.toLowerCase().includes(tier) &&
      (entry.litellm_provider === "anthropic" || key.startsWith("claude")),
    )
    .sort(([a], [b]) => b.localeCompare(a)); // lexicographic desc → newest date suffix first

  return candidates[0]?.[1] ?? null;
};

// Main API: resolve model → pricing
let pricingCache: Record<string, LiteLLMEntry> | null | undefined;

export const getPricing = async (model: string): Promise<ModelPricing> => {
  // Lazy load
  if (pricingCache === undefined) {
    pricingCache = await loadPricingData();
  }

  if (pricingCache) {
    const entry = resolveModel(model, pricingCache);
    if (entry) {
      const pricing = toLitePricing(entry);
      if (pricing) return pricing;
    }
  }

  // Fallback to hardcoded
  const lower = model.toLowerCase();
  if (lower.includes("opus")) return FALLBACK.opus!;
  if (lower.includes("haiku")) return FALLBACK.haiku!;
  return FALLBACK.sonnet!;
};

// Synchronous version using cached data only (for hot path)
export const getPricingSync = (model: string): ModelPricing => {
  if (pricingCache) {
    const entry = resolveModel(model, pricingCache);
    if (entry) {
      const pricing = toLitePricing(entry);
      if (pricing) return pricing;
    }
  }

  const lower = model.toLowerCase();
  if (lower.includes("opus")) return FALLBACK.opus!;
  if (lower.includes("haiku")) return FALLBACK.haiku!;
  return FALLBACK.sonnet!;
};

// Pre-warm cache (call at startup)
export const warmPricingCache = async (): Promise<void> => {
  pricingCache = await loadPricingData();
};

export const formatCost = (dollars: number): string =>
  dollars < 0.01 ? `$${(dollars * 100).toFixed(2)}¢` : `$${dollars.toFixed(4)}`;
