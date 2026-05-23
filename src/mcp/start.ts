// MCP tool: t.start — begin executing tasks sequentially via tailrec loop
// Writes signal to trigger reassemble with task context

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config/index.js";
import { listPlans, parseTasks } from "./tasks.js";

export const handleStart = (args: { plan?: string }): string => {
  const config = loadConfig();
  const plans = listPlans(config.cards_dir);

  if (plans.length === 0) return "No plans found. Use t.plan first.";

  const planSlug = args.plan ?? plans[0]!;
  const planDir = join(config.cards_dir, "plans", planSlug);
  const tasksPath = join(planDir, "tasks.md");

  if (!existsSync(tasksPath)) return `Plan "${planSlug}" not found.`;

  const tasks = parseTasks(readFileSync(tasksPath, "utf-8"));
  const nextTask = tasks.find((t) => !t.completed);

  if (!nextTask) return `All tasks in "${planSlug}" are complete!`;

  // Read design.md for shared principles (injected directly into task context)
  const designPath = join(planDir, "design.md");
  const designRaw = existsSync(designPath) ? readFileSync(designPath, "utf-8") : "";
  // Strip frontmatter for inline inclusion
  const designBody = designRaw.replace(/^---[\s\S]*?---\s*/, "").trim();

  // Read task-specific input.md if it exists (handoff from previous task)
  const taskSlug = nextTask.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const taskDir = join(planDir, "tasks", taskSlug);
  const inputPath = join(taskDir, "input.md");
  const handoff = existsSync(inputPath) ? readFileSync(inputPath, "utf-8") : "";

  // Build the reassemble signal — the parent tailrec loop will pick this up
  const SIGNAL_PATH = process.env["TAILREC_SIGNAL_PATH"];
  if (!SIGNAL_PATH) {
    return `Error: TAILREC_SIGNAL_PATH not set. t.start must run inside a tailrec session.`;
  }

  const query = [
    `## Task: ${nextTask.title}`,
    designBody ? `\n## Design Principles\n${designBody}` : "",
    handoff ? `\n## Handoff from previous task\n${handoff}` : "",
    `\n## Instructions`,
    `Complete the task above. Before finishing:`,
    `1. Save important decisions/tips for the next task`,
    `2. Call reassemble with next_input set to the next task title`,
  ].filter(Boolean).join("\n");

  const contextHints = [
    `plan: ${planSlug}`,
    `task: ${nextTask.title}`,
  ].filter(Boolean);

  writeFileSync(SIGNAL_PATH, JSON.stringify({
    action: "restart",
    query,
    contextHints,
    decisions: { _active_plan: planSlug, _active_task: nextTask.title },
  }));

  // Kill parent to trigger restart loop
  setTimeout(() => process.kill(process.ppid!, "SIGTERM"), 100);

  return `Starting task: ${nextTask.title}\nReassembling with task context...`;
};

// Mark current task as done and advance (called by reassemble with task completion)
export const markTaskDone = (planSlug: string, taskTitle: string): void => {
  const config = loadConfig();
  const tasksPath = join(config.cards_dir, "plans", planSlug, "tasks.md");
  if (!existsSync(tasksPath)) return;

  const content = readFileSync(tasksPath, "utf-8");
  const updated = content.replace(`- [ ] ${taskTitle}`, `- [x] ${taskTitle}`);
  writeFileSync(tasksPath, updated);
};
