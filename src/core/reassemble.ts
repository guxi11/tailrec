// Reassemble: persist decisions → collect cards → build appendix

import type { TailrecConfig } from "../config/index.js";
import { mergeDecisions, readDecisions } from "../state/index.js";
import { loadWorkspace, sharedCards, taskCards } from "../cards/index.js";
import { collect } from "../collector/index.js";
import { buildPrompt, type AssembledPrompt } from "./prompt-builder.js";

export interface ReassembleInput {
  next_input: string;
  decisions?: Record<string, unknown>;
  context_hints?: string[];
}

export interface ReassembleResult {
  prompt: AssembledPrompt;
}

export const reassemble = async (
  input: ReassembleInput,
  config: TailrecConfig,
  specName: string,
  backend: string,
): Promise<ReassembleResult> => {
  // 1. Persist decisions
  if (input.decisions) {
    mergeDecisions(config.state_dir, specName, input.decisions);
  }

  // 2. Load cards
  const allCards = loadWorkspace(config.cards_dir);
  const decisions = readDecisions(config.state_dir, specName);
  const activePlan = decisions._active_plan as string | undefined;

  // When executing a plan task, exclude tasks.md (full task list) to prevent
  // the LLM from seeing all tasks and working beyond its assigned scope
  const filtered = activePlan
    ? allCards.filter((c) => !c.relativePath.match(/plans\/[^/]+\/tasks\.md$/))
    : allCards;

  const shared = sharedCards(filtered);
  const task = taskCards(filtered);

  // 3. Run collector to select relevant task cards
  const collectorResult = await collect({
    nextInput: input.next_input,
    contextHints: input.context_hints,
    cards: task,
    model: config.collector_model,
    backend,
  });

  // 4. Resolve selected cards
  const selectedCards = collectorResult.selectedCards
    .map((name) => task.find((c) => c.name === name))
    .filter((c): c is NonNullable<typeof c> => c != null);

  // 5. Assemble appendix
  const prompt = buildPrompt({
    sharedCards: shared,
    selectedCards,
    decisions,
    specName,
    initialTask: input.next_input,
  });

  return { prompt };
};
