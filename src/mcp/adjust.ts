// MCP tool: t.adjust — rewrite the task chain
// Accepts JSON array of {title, spec} and links them as a chain via frontmatter `next`

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config/index.js";
import { listPlans } from "./tasks.js";

const slugify = (title: string): string =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

interface TaskInput {
  title: string;
  spec?: string;
}

// Try JSON, fall back to line-per-task
const parseTaskInputs = (content: string): TaskInput[] => {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].title) return parsed;
  } catch { /* not JSON */ }

  // Plain text: one task title per line (- prefix optional)
  return content.split("\n")
    .map((l) => l.replace(/^[-*]\s*(\[[ x]\]\s*)?/, "").trim())
    .filter(Boolean)
    .map((title) => ({ title }));
};

const writeTaskCard = (
  taskDir: string,
  _slug: string,
  planSlug: string,
  task: TaskInput,
  nextSlug: string | null,
  isHead: boolean,
): void => {
  mkdirSync(taskDir, { recursive: true });
  writeFileSync(join(taskDir, "task.md"), `---
title: "${task.title}"
status: pending
next: ${nextSlug ? `"${nextSlug}"` : "null"}${isHead ? "\nhead: true" : ""}
type: task
description: "Task: ${task.title} (plan: ${planSlug})"
---

# ${task.title}

${task.spec ?? ""}
`);
};

export const handleAdjust = (args: { plan?: string; content: string }): string => {
  const config = loadConfig();
  const plans = listPlans(config.cards_dir);

  if (plans.length === 0) return "No plans found. Use t.plan first.";

  const planSlug = args.plan ?? plans[0]!;
  const planDir = join(config.cards_dir, "plans", planSlug);
  const tasksDir = join(planDir, "tasks");

  if (!existsSync(planDir)) return `Plan "${planSlug}" not found.`;
  mkdirSync(tasksDir, { recursive: true });

  const tasks = parseTaskInputs(args.content);
  if (tasks.length === 0) return "No tasks provided.";

  // Build linked chain: each points to the next
  const slugs = tasks.map((t) => slugify(t.title));

  for (let i = 0; i < tasks.length; i++) {
    const nextSlug = i < tasks.length - 1 ? slugs[i + 1]! : null;
    const taskDir = join(tasksDir, slugs[i]!);
    writeTaskCard(taskDir, slugs[i]!, planSlug, tasks[i]!, nextSlug, i === 0);
  }

  return `Created task chain for "${planSlug}" (${tasks.length} tasks linked).`;
};
