// Assemble card context into a single system prompt appendix

import type { Card } from "../cards/index.js";
import type { Decisions } from "../state/index.js";

export interface AssembledPrompt {
  appendix: string;
}

const TOOLS_SECTION = `# Tailrec Tools

You have access to the following MCP tools from the "tailrec" server. Use them when appropriate:

| Tool | When to use |
|------|-------------|
| reassemble | Context is stale or pivoting to a different domain — clears context and reloads with fresh cards |
| t.plan | User wants to break a large feature into tracked tasks — creates plan.md, design.md, tasks.md |
| t.resume | Show available plans or restore task queue for a specific plan |
| t.specify | Add constraints/specifications to a plan's design.md |
| t.adjust | Reorder, split, merge, or remove tasks in a plan |
| t.tasks | Show current task list with completion status |
| t.start | Begin the next incomplete task (triggers reassemble with task context) |
| t.archive | Archive a completed plan, extract design into ground truth cards |
| t.cost | Show actual token cost vs hypothetical single-session O(n²) cost |

When the user types a command like "t.plan", "t.cost", etc., call the corresponding MCP tool.`;

export const buildPrompt = (args: {
  sharedCards: Card[];
  selectedCards: Card[];
  decisions: Decisions;
  specName?: string;
  initialTask?: string;
}): AssembledPrompt => {
  const { sharedCards, selectedCards, decisions, specName, initialTask } = args;

  const sections: string[] = [TOOLS_SECTION];

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
