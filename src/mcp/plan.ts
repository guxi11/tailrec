// MCP tool: t.plan — generate plan card structure
// Creates cards/plans/<plan-title>/ with plan.md, design.md, tasks.md

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config/index.js";

const slugify = (title: string): string =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const handlePlan = (args: { content: string }): string => {
  const config = loadConfig();
  const title = args.content.split("\n")[0]!.trim();
  const slug = slugify(title);
  const planDir = join(config.cards_dir, "plans", slug);

  if (existsSync(planDir)) {
    return `Plan "${title}" already exists at ${planDir}`;
  }

  mkdirSync(planDir, { recursive: true });
  mkdirSync(join(planDir, "tasks"), { recursive: true });

  // plan.md — overview and goals
  writeFileSync(join(planDir, "plan.md"), `---
type: plan
title: "${title}"
shared: false
description: "${title}"
---

# ${title}

## Goals

${args.content}

## Scope

<!-- Define boundaries -->
`);

  // design.md — architectural decisions, principles (shared in prompt during execution)
  writeFileSync(join(planDir, "design.md"), `---
type: design
title: "${title} — Design"
shared: false
description: "Design principles for ${title}"
---

# Design Principles

<!-- Architectural decisions and shared principles for all tasks -->
`);

  // tasks.md — task list with completion markers
  writeFileSync(join(planDir, "tasks.md"), `---
type: plan
title: "${title} — Tasks"
shared: false
description: "Task breakdown for ${title}"
---

# Tasks

<!-- Format: - [ ] task title | - [x] completed task -->
`);

  return `Created plan "${title}" at ${planDir}\nFiles: plan.md, design.md, tasks.md\nNext: use t.specify to add constraints, or edit tasks.md directly.`;
};
