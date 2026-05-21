// Reassemble: persist decisions → collect cards → build appendix

import type { DeckhandConfig } from "../config/index.js";
import { mergeDecisions, readDecisions } from "../state/index.js";
import { loadWorkspace, sharedCards, taskCards } from "../cards/index.js";
import { collect } from "../collector/index.js";
import { buildPrompt, type AssembledPrompt } from "./prompt-builder.js";
import { recordUsage, type SessionUsage } from "./usage.js";
import type { UsageEntry } from "../utils/cost.js";

export interface ReassembleInput {
  next_input: string;
  decisions?: Record<string, unknown>;
  context_hints?: string[];
}

export interface ReassembleResult {
  prompt: AssembledPrompt;
  collectorUsage: { input_tokens: number; output_tokens: number };
}

export const reassemble = async (
  input: ReassembleInput,
  config: DeckhandConfig,
  specName: string,
  sessionUsage: SessionUsage,
): Promise<ReassembleResult> => {
  // 1. Persist decisions
  if (input.decisions) {
    mergeDecisions(config.state_dir, specName, input.decisions);
  }

  // 2. Load cards
  const allCards = loadWorkspace(config.cards_dir);
  const shared = sharedCards(allCards);
  const task = taskCards(allCards);

  // 3. Run collector to select relevant task cards
  const collectorResult = await collect({
    nextInput: input.next_input,
    contextHints: input.context_hints,
    cards: task,
    model: config.collector_model,
  });

  // Record collector usage
  const collectorEntry: UsageEntry = {
    model: config.collector_model,
    input_tokens: collectorResult.usage.input_tokens,
    output_tokens: collectorResult.usage.output_tokens,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    timestamp: new Date().toISOString(),
  };
  recordUsage(sessionUsage, collectorEntry);

  // 4. Resolve selected cards
  const selectedCards = collectorResult.selectedCards
    .map((name) => task.find((c) => c.name === name))
    .filter((c): c is NonNullable<typeof c> => c != null);

  // 5. Assemble appendix
  const decisions = readDecisions(config.state_dir, specName);
  const prompt = buildPrompt({
    sharedCards: shared,
    selectedCards,
    decisions,
    specName,
    initialTask: input.next_input,
  });

  return { prompt, collectorUsage: collectorResult.usage };
};
