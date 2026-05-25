// Assemble card context into a single system prompt appendix

import type { Card } from "../cards/index.js";
import type { Decisions } from "../state/index.js";

export interface AssembledPrompt {
  appendix: string;
}

const TOOLS_SECTION = `# Tailrec Tools

| Tool | When to use |
|------|-------------|
| reassemble | Signal task completion — clears context and advances to next task |
| t.plan | Break work into tracked tasks (creates structured plan cards) |
| t.tasks | Show task list with completion status |
| t.start | Begin executing tasks |`;

// When a plan task is active, this HARD constraint is prepended
const TASK_BOUNDARY = `# ⚠️ SINGLE-TASK SESSION — HARD CONSTRAINT

You are in a tailrec managed session. You are assigned EXACTLY ONE task (shown below in "Current Task").

**RULES:**
1. Implement ONLY the task described in "Current Task". Nothing else.
2. Do NOT look ahead to other tasks. Do NOT implement features beyond this task's scope.
3. When you have completed this ONE task, you MUST call the \`reassemble\` MCP tool immediately.
4. Pass a 1-sentence summary of what you did as \`next_input\`. Example: \`reassemble({ next_input: "Added Feedback types and enums" })\`
5. The system handles task advancement automatically — do NOT try to start the next task yourself.

**If you implement more than the assigned task, your work beyond scope will be discarded.**`;

export const buildPrompt = (args: {
  sharedCards: Card[];
  selectedCards: Card[];
  decisions: Decisions;
  specName?: string;
  initialTask?: string;
}): AssembledPrompt => {
  const { sharedCards, selectedCards, decisions, specName, initialTask } = args;

  // Detect if we're in plan-task execution mode
  const isTaskExecution = Boolean(decisions._active_plan && decisions._active_task);

  const sections: string[] = [];

  // Hard constraint goes FIRST if in task execution mode
  if (isTaskExecution) {
    sections.push(TASK_BOUNDARY);
  }

  sections.push(TOOLS_SECTION);

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

  // Layer 3: Persisted decisions (filter internal keys from display)
  const visibleDecisions = Object.fromEntries(
    Object.entries(decisions).filter(([k]) => !k.startsWith("_")),
  );
  if (Object.keys(visibleDecisions).length > 0) {
    sections.push(
      `# Decisions${specName ? ` (${specName})` : ""}\n\`\`\`json\n${JSON.stringify(visibleDecisions, null, 2)}\n\`\`\``,
    );
  }

  // Layer 4: Current task
  if (initialTask) {
    sections.push(`# Current Task\n${initialTask}`);
  }

  // Closing reminder (recency bias — LLMs attend more to end of context)
  if (isTaskExecution) {
    sections.push(`# Reminder\nWhen this task is complete, call \`reassemble\` immediately. Do not continue to other work.`);
  }

  return { appendix: sections.join("\n\n---\n") };
};
