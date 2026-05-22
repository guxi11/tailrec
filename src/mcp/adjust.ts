// MCP tool: t.adjust — modify task breakdown in tasks.md

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config/index.js";
import { listPlans } from "./tasks.js";

export const handleAdjust = (args: { plan?: string; content: string }): string => {
  const config = loadConfig();
  const plans = listPlans(config.cards_dir);

  if (plans.length === 0) return "No plans found. Use t.plan first.";

  const planSlug = args.plan ?? plans[0]!;
  const tasksPath = join(config.cards_dir, "plans", planSlug, "tasks.md");

  if (!existsSync(tasksPath)) return `Plan "${planSlug}" not found.`;

  // Replace the task list section with new content
  // Content should be in checkbox format: - [ ] task / - [x] completed
  const existing = readFileSync(tasksPath, "utf-8");

  // Find the # Tasks header and replace everything after it
  const headerIdx = existing.indexOf("# Tasks");
  const prefix = headerIdx !== -1 ? existing.slice(0, headerIdx + "# Tasks".length) : existing;
  const updated = `${prefix}\n\n${args.content}\n`;
  writeFileSync(tasksPath, updated);

  return `Updated tasks for "${planSlug}".`;
};
