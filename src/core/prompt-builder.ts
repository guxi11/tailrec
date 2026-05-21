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
}): AssembledPrompt => {
  const { sharedCards, selectedCards, decisions, specName } = args;

  const sections: string[] = [];

  // Shared cards (always included)
  if (sharedCards.length > 0) {
    sections.push(
      "# Shared Context\n" +
        sharedCards.map((c) => `## ${c.name}\n${c.body}`).join("\n\n"),
    );
  }

  // Collector-selected task cards
  if (selectedCards.length > 0) {
    sections.push(
      "# Task Context\n" +
        selectedCards.map((c) => `## ${c.name}\n${c.body}`).join("\n\n"),
    );
  }

  // Persisted decisions
  const hasDecisions = Object.keys(decisions).length > 0;
  if (hasDecisions) {
    sections.push(
      `# Decisions${specName ? ` (${specName})` : ""}\n\`\`\`json\n${JSON.stringify(decisions, null, 2)}\n\`\`\``,
    );
  }

  return { appendix: sections.join("\n\n---\n") };
};
