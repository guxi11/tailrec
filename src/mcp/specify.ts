// MCP tool: t.specify — add specification docs to plan, optimize existing constraints

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config/index.js";
import { listPlans } from "./tasks.js";

export const handleSpecify = (args: { plan?: string; content: string }): string => {
  const config = loadConfig();
  const plans = listPlans(config.cards_dir);

  if (plans.length === 0) return "No plans found. Use t.plan first.";

  const planSlug = args.plan ?? plans[0]!;
  const planDir = join(config.cards_dir, "plans", planSlug);

  if (!existsSync(planDir)) return `Plan "${planSlug}" not found.`;

  // Append to design.md (specifications enrich the design constraints)
  const designPath = join(planDir, "design.md");
  const existing = existsSync(designPath) ? readFileSync(designPath, "utf-8") : "";
  const updated = existing.trimEnd() + `\n\n## Specification\n\n${args.content}\n`;
  writeFileSync(designPath, updated);

  return `Added specification to "${planSlug}/design.md".`;
};
