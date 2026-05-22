// Inter-session bridge — small model reads previous session, generates handoff for next task

import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { TailrecConfig } from "../config/index.js";

const BRIDGE_SYSTEM_PROMPT = `You are a session handoff summarizer. Given a completed task and its session context, extract:
1. Key decisions made during this task
2. Tips/gotchas for the person working on the next task
3. Relevant state changes (files created, APIs defined, schemas modified)

Be concise — this will be injected as context for the next task. Focus on actionable information.
Output as markdown with sections: ## Decisions, ## Tips, ## State Changes`;

export interface BridgeInput {
  completedTask: string;
  nextTask: string;
  sessionSummary: string; // decisions/context from the completed session
  planSlug: string;
}

export const runBridge = async (
  input: BridgeInput,
  config: TailrecConfig,
): Promise<{ inputMdPath: string; usage: { input_tokens: number; output_tokens: number } }> => {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: config.bridge_model,
    max_tokens: 2048,
    system: BRIDGE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `## Completed Task\n${input.completedTask}\n\n## Session Context\n${input.sessionSummary}\n\n## Next Task\n${input.nextTask}\n\nGenerate a handoff summary for the next task.`,
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Write to next task's input.md
  const taskSlug = input.nextTask.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const inputMdPath = join(config.cards_dir, "plans", input.planSlug, "tasks", taskSlug, "input.md");
  const dir = dirname(inputMdPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(inputMdPath, text);

  return {
    inputMdPath,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
};
