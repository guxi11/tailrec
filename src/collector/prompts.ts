// Collector system and user prompts

export const COLLECTOR_SYSTEM_PROMPT = `You are a context selector for a coding assistant. Given a user's next task/input and a list of available knowledge cards, select the most relevant cards to include in the assistant's context.

Rules:
- Return ONLY a JSON array of card names, ordered by relevance (most relevant first)
- Select cards that directly help accomplish the stated task
- Follow [[wikilinks]] to include related cards when the link is relevant
- Prefer fewer, more relevant cards over many tangential ones
- Maximum 10 cards unless the task clearly requires more
- If no cards are relevant, return an empty array []`;

export const buildCollectorUserPrompt = (args: {
  nextInput: string;
  contextHints?: string[];
  cardIndex: Array<{ name: string; description: string; links: string[] }>;
}): string => {
  const { nextInput, contextHints, cardIndex } = args;

  const cardList = cardIndex
    .map((c) => {
      const links = c.links.length > 0 ? ` → links to: ${c.links.join(", ")}` : "";
      return `- ${c.name}: ${c.description || "(no description)"}${links}`;
    })
    .join("\n");

  const hints = contextHints?.length
    ? `\nContext hints from previous session:\n${contextHints.map((h) => `- ${h}`).join("\n")}`
    : "";

  return `## Task
${nextInput}
${hints}
## Available Cards
${cardList}

## Response
Return a JSON array of card names to include, ordered by relevance.`;
};
