// MCP tool: t.resume — list plans and show progress via chain traversal

import { join } from "node:path";
import { loadConfig } from "../config/index.js";
import { listPlans, walkChain, findCurrentTask } from "./tasks.js";

export const handleResume = (args: { plan?: string }): string => {
  const config = loadConfig();
  const plans = listPlans(config.cards_dir);

  if (plans.length === 0) return "No plans to resume. Use t.plan to create one.";

  if (!args.plan) {
    // List available plans with progress
    const lines = plans.map((slug) => {
      const planDir = join(config.cards_dir, "plans", slug);
      const chain = walkChain(planDir);
      const done = chain.filter((t) => t.status === "done").length;
      return `  ${slug} (${done}/${chain.length} tasks done)`;
    });
    return `Available plans:\n${lines.join("\n")}\n\nSpecify plan name with t.resume to restore.`;
  }

  // Restore specific plan
  const planDir = join(config.cards_dir, "plans", args.plan);
  const chain = walkChain(planDir);
  if (chain.length === 0) return `Plan "${args.plan}" not found or has no tasks.`;

  const current = findCurrentTask(planDir);
  if (!current) return `All tasks in "${args.plan}" are complete. Use t.archive to finalize.`;

  const done = chain.filter((t) => t.status === "done").length;
  return `Resumed plan "${args.plan}" — ${done}/${chain.length} done.\nNext task: ${current.title}\n\nUse t.start to begin executing.`;
};
