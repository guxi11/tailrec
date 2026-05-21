// Collector orchestration — calls Haiku to select relevant cards

import Anthropic from "@anthropic-ai/sdk";
import type { Card } from "../cards/index.js";
import { COLLECTOR_SYSTEM_PROMPT, buildCollectorUserPrompt } from "./prompts.js";

export interface CollectorResult {
  selectedCards: string[];
  usage: { input_tokens: number; output_tokens: number };
}

export const collect = async (args: {
  nextInput: string;
  contextHints?: string[];
  cards: Card[];
  model: string;
  apiKey?: string;
}): Promise<CollectorResult> => {
  const { nextInput, contextHints, cards, model, apiKey } = args;

  if (cards.length === 0) return { selectedCards: [], usage: { input_tokens: 0, output_tokens: 0 } };

  const cardIndex = cards.map((c) => ({
    name: c.name,
    description: c.frontmatter.description ?? "",
    links: c.links,
  }));

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: COLLECTOR_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildCollectorUserPrompt({ nextInput, contextHints, cardIndex }) },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Extract JSON array from response
  const match = text.match(/\[[\s\S]*?\]/);
  const selectedCards: string[] = match ? JSON.parse(match[0]) : [];

  return {
    selectedCards,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
};
