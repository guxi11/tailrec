// Assemble card context into a single system prompt appendix

import type { Card } from "../cards/index.js";
import type { Decisions } from "../state/index.js";

export interface AssembledPrompt {
  appendix: string;
}

export const buildPrompt = (args: {
  sharedCards: Card[];
  selectedCards: Card[];
  decisions: Decisions;
  specName?: string;
  initialTask?: string;
}): AssembledPrompt => {
  const { sharedCards, selectedCards, decisions, specName, initialTask } = args;

  const sections: string[] = [];

  // Layer 1: Shared cards (always included)
  if (sharedCards.length > 0) {
    sections.push(
      "# Shared Context\n" +
        sharedCards.map((c) => `## ${c.name}\n${c.body}`).join("\n\n"),
    );
  }

  // Layer 2: Collector-selected task cards
  if (selectedCards.length > 0) {
    sections.push(
      "# Task Context\n" +
        selectedCards.map((c) => `## ${c.name}\n${c.body}`).join("\n\n"),
    );
  }

  // Layer 3: Persisted decisions
  const hasDecisions = Object.keys(decisions).length > 0;
  if (hasDecisions) {
    sections.push(
      `# Decisions${specName ? ` (${specName})` : ""}\n\`\`\`json\n${JSON.stringify(decisions, null, 2)}\n\`\`\``,
    );
  }

  // Layer 4: Initial task / user message
  if (initialTask) {
    sections.push(`# Current Task\n${initialTask}`);
  }

  return { appendix: sections.join("\n\n---\n") };
};
