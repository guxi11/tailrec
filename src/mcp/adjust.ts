// MCP tool: t.adjust — modify task breakdown in tasks.md + generate per-task cards
// Accepts either checkbox-format text or structured JSON with per-task specs

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config/index.js";
import { listPlans, parseTasks } from "./tasks.js";

const slugify = (title: string): string =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

interface StructuredTask {
  title: string;
  spec?: string;
}

// Try parsing as JSON array of {title, spec}
const tryParseStructured = (content: string): StructuredTask[] | null => {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].title) {
      return parsed;
    }
  } catch { /* not JSON */ }
  return null;
};

const writeTaskCard = (planDir: string, planSlug: string, title: string, spec: string): void => {
  const taskSlug = slugify(title);
  const taskDir = join(planDir, "tasks", taskSlug);
  mkdirSync(taskDir, { recursive: true });
  writeFileSync(join(taskDir, "task.md"), `---
type: task
title: "${title}"
shared: false
description: "Task: ${title} (plan: ${planSlug})"
---

# ${title}

${spec}
`);
};

const ensureTaskCard = (planDir: string, planSlug: string, title: string): void => {
  const taskSlug = slugify(title);
  const taskMdPath = join(planDir, "tasks", taskSlug, "task.md");
  if (existsSync(taskMdPath)) return;
  writeTaskCard(planDir, planSlug, title, "<!-- Spec filled during execution -->");
};

export const handleAdjust = (args: { plan?: string; content: string }): string => {
  const config = loadConfig();
  const plans = listPlans(config.cards_dir);

  if (plans.length === 0) return "No plans found. Use t.plan first.";

  const planSlug = args.plan ?? plans[0]!;
  const planDir = join(config.cards_dir, "plans", planSlug);
  const tasksPath = join(planDir, "tasks.md");

  if (!existsSync(tasksPath)) return `Plan "${planSlug}" not found.`;

  // Try structured JSON format first
  const structured = tryParseStructured(args.content);

  if (structured) {
    // Structured: write tasks.md from titles + create rich task cards
    const taskList = structured.map((t) => `- [ ] ${t.title}`).join("\n");
    const existing = readFileSync(tasksPath, "utf-8");
    const headerIdx = existing.indexOf("# Tasks");
    const prefix = headerIdx !== -1 ? existing.slice(0, headerIdx + "# Tasks".length) : existing;
    writeFileSync(tasksPath, `${prefix}\n\n${taskList}\n`);

    for (const task of structured) {
      writeTaskCard(planDir, planSlug, task.title, task.spec ?? "");
    }

    return `Updated tasks for "${planSlug}" (${structured.length} tasks with specs).`;
  }

  // Plain checkbox format
  const existing = readFileSync(tasksPath, "utf-8");
  const headerIdx = existing.indexOf("# Tasks");
  const prefix = headerIdx !== -1 ? existing.slice(0, headerIdx + "# Tasks".length) : existing;
  const updated = `${prefix}\n\n${args.content}\n`;
  writeFileSync(tasksPath, updated);

  const tasks = parseTasks(updated);
  for (const task of tasks) {
    ensureTaskCard(planDir, planSlug, task.title);
  }

  return `Updated tasks for "${planSlug}" (${tasks.length} tasks, card dirs created).`;
};
