// MCP tool: t.adjust — modify task breakdown in tasks.md + generate per-task cards

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config/index.js";
import { listPlans, parseTasks } from "./tasks.js";

const slugify = (title: string): string =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Create task.md card for a task entry (enables collector discovery)
const ensureTaskCard = (planDir: string, planSlug: string, title: string): void => {
  const taskSlug = slugify(title);
  const taskDir = join(planDir, "tasks", taskSlug);
  const taskMdPath = join(taskDir, "task.md");
  if (existsSync(taskMdPath)) return;

  mkdirSync(taskDir, { recursive: true });
  writeFileSync(taskMdPath, `---
type: task
title: "${title}"
shared: false
description: "Task: ${title} (plan: ${planSlug})"
---

# ${title}

<!-- Task details filled during execution -->
`);
};

export const handleAdjust = (args: { plan?: string; content: string }): string => {
  const config = loadConfig();
  const plans = listPlans(config.cards_dir);

  if (plans.length === 0) return "No plans found. Use t.plan first.";

  const planSlug = args.plan ?? plans[0]!;
  const planDir = join(config.cards_dir, "plans", planSlug);
  const tasksPath = join(planDir, "tasks.md");

  if (!existsSync(tasksPath)) return `Plan "${planSlug}" not found.`;

  // Replace the task list section with new content
  const existing = readFileSync(tasksPath, "utf-8");
  const headerIdx = existing.indexOf("# Tasks");
  const prefix = headerIdx !== -1 ? existing.slice(0, headerIdx + "# Tasks".length) : existing;
  const updated = `${prefix}\n\n${args.content}\n`;
  writeFileSync(tasksPath, updated);

  // Generate per-task card files for collector discovery
  const tasks = parseTasks(updated);
  for (const task of tasks) {
    ensureTaskCard(planDir, planSlug, task.title);
  }

  return `Updated tasks for "${planSlug}" (${tasks.length} tasks, card dirs created).`;
};
