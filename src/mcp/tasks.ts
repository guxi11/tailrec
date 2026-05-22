// MCP tool: t.tasks — show task list with completion status from tasks.md

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config/index.js";

export interface TaskItem {
  title: string;
  completed: boolean;
  index: number;
}

// Parse tasks.md checkbox format: - [ ] title / - [x] title
export const parseTasks = (content: string): TaskItem[] => {
  const lines = content.split("\n");
  const tasks: TaskItem[] = [];
  let index = 0;
  for (const line of lines) {
    const match = line.match(/^- \[([ x])\] (.+)$/);
    if (match) {
      tasks.push({ title: match[2]!, completed: match[1] === "x", index });
      index++;
    }
  }
  return tasks;
};

// Find active plan dirs
export const listPlans = (cardsDir: string): string[] => {
  const plansDir = join(cardsDir, "plans");
  if (!existsSync(plansDir)) return [];
  return readdirSync(plansDir).filter((d) => {
    const tasksPath = join(plansDir, d, "tasks.md");
    return existsSync(tasksPath);
  });
};

export const getTasksForPlan = (cardsDir: string, planSlug: string): TaskItem[] => {
  const tasksPath = join(cardsDir, "plans", planSlug, "tasks.md");
  if (!existsSync(tasksPath)) return [];
  return parseTasks(readFileSync(tasksPath, "utf-8"));
};

export const handleTasks = (args: { plan?: string }): string => {
  const config = loadConfig();
  const plans = listPlans(config.cards_dir);

  if (plans.length === 0) return "No plans found. Use t.plan to create one.";

  // If plan specified, show that one; otherwise show all
  const targets = args.plan ? [args.plan] : plans;
  const sections: string[] = [];

  for (const slug of targets) {
    const tasks = getTasksForPlan(config.cards_dir, slug);
    if (tasks.length === 0) {
      sections.push(`## ${slug}\nNo tasks defined yet.`);
      continue;
    }
    const done = tasks.filter((t) => t.completed).length;
    const lines = tasks.map((t) => `  ${t.completed ? "✓" : "○"} ${t.title}`);
    sections.push(`## ${slug} (${done}/${tasks.length})\n${lines.join("\n")}`);
  }

  return sections.join("\n\n");
};
