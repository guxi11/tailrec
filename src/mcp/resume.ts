// MCP tool: t.resume — list plans and restore task queue state

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config/index.js";
import { listPlans, parseTasks } from "./tasks.js";

export const handleResume = (args: { plan?: string }): string => {
  const config = loadConfig();
  const plans = listPlans(config.cards_dir);

  if (plans.length === 0) return "No plans to resume. Use t.plan to create one.";

  if (!args.plan) {
    // List available plans with progress
    const lines = plans.map((slug) => {
      const tasksPath = join(config.cards_dir, "plans", slug, "tasks.md");
      const tasks = existsSync(tasksPath) ? parseTasks(readFileSync(tasksPath, "utf-8")) : [];
      const done = tasks.filter((t) => t.completed).length;
      return `  ${slug} (${done}/${tasks.length} tasks done)`;
    });
    return `Available plans:\n${lines.join("\n")}\n\nSpecify plan name with t.resume to restore.`;
  }

  // Restore specific plan
  const tasksPath = join(config.cards_dir, "plans", args.plan, "tasks.md");
  if (!existsSync(tasksPath)) return `Plan "${args.plan}" not found.`;

  const tasks = parseTasks(readFileSync(tasksPath, "utf-8"));
  const nextTask = tasks.find((t) => !t.completed);

  if (!nextTask) return `All tasks in "${args.plan}" are complete. Use t.archive to finalize.`;

  const done = tasks.filter((t) => t.completed).length;
  return `Resumed plan "${args.plan}" — ${done}/${tasks.length} done.\nNext task: ${nextTask.title}\n\nUse t.start to begin executing.`;
};
