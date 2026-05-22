// MCP tool: t.archive — move plan to archive, summarize into ground truth cards

import { existsSync, mkdirSync, renameSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config/index.js";
import { listPlans } from "./tasks.js";

export const handleArchive = (args: { plan?: string }): string => {
  const config = loadConfig();
  const plans = listPlans(config.cards_dir);

  if (plans.length === 0) return "No plans to archive.";

  const planSlug = args.plan ?? plans[0]!;
  const planDir = join(config.cards_dir, "plans", planSlug);

  if (!existsSync(planDir)) return `Plan "${planSlug}" not found.`;

  // Create archive destination
  const archiveDir = join(config.cards_dir, "archive", "plans");
  mkdirSync(archiveDir, { recursive: true });

  const archiveDest = join(archiveDir, planSlug);
  if (existsSync(archiveDest)) return `Plan "${planSlug}" already archived.`;

  // Move plan to archive
  renameSync(planDir, archiveDest);

  // Extract design decisions into ground truth card
  const designPath = join(archiveDest, "design.md");
  if (existsSync(designPath)) {
    const designContent = readFileSync(designPath, "utf-8");
    const designsDir = join(config.cards_dir, "designs");
    mkdirSync(designsDir, { recursive: true });
    writeFileSync(join(designsDir, `${planSlug}.md`), `---
type: design
title: "${planSlug}"
shared: false
description: "Design decisions from plan: ${planSlug}"
tags: [archived]
---

${designContent.replace(/^---[\s\S]*?---\s*/, "")}
`);
  }

  return `Archived plan "${planSlug}" to cards/archive/plans/${planSlug}\nDesign extracted to cards/designs/${planSlug}.md`;
};
