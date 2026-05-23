// MCP tool: t.plan — create plan card structure
// Pure file writer — intelligence lives in the skill/LLM session, not here

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config/index.js";

const slugify = (title: string): string =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

interface PlanInput {
  title: string;
  design?: string;
  tasks?: Array<{ title: string; spec: string }>;
  overview?: string;
}

// Accept either structured JSON or plain content string
const parseInput = (content: string): PlanInput => {
  // Try JSON first
  try {
    const parsed = JSON.parse(content);
    if (parsed.title) return parsed;
  } catch { /* not JSON, treat as plain text */ }

  // Plain text: first line = title, rest = overview
  const lines = content.split("\n");
  const title = lines[0]!.trim();
  const overview = lines.slice(1).join("\n").trim();
  return { title, overview };
};

export const handlePlan = async (args: { content: string }): Promise<string> => {
  const config = loadConfig();
  const input = parseInput(args.content);
  const slug = slugify(input.title);
  const planDir = join(config.cards_dir, "plans", slug);

  if (existsSync(planDir)) {
    return `Plan "${input.title}" already exists at ${planDir}`;
  }

  mkdirSync(planDir, { recursive: true });
  mkdirSync(join(planDir, "tasks"), { recursive: true });

  // plan.md — overview
  writeFileSync(join(planDir, "plan.md"), `---
type: plan
title: "${input.title}"
shared: false
description: "${input.title}"
---

# ${input.title}

${input.overview ?? ""}
`);

  // design.md — shared constraints (populated by t.specify or inline)
  const designContent = input.design
    ? input.design
    : `# Design Principles\n\n<!-- Populate via t.specify after codebase exploration -->`;

  writeFileSync(join(planDir, "design.md"), `---
type: design
title: "${input.title} — Design"
shared: false
description: "Shared design constraints for ${input.title}"
---

${designContent}
`);

  // tasks.md + per-task cards
  if (input.tasks && input.tasks.length > 0) {
    const taskList = input.tasks.map((t) => `- [ ] ${t.title}`).join("\n");
    writeFileSync(join(planDir, "tasks.md"), `---
type: plan
title: "${input.title} — Tasks"
shared: false
description: "Task breakdown for ${input.title}"
---

# Tasks

${taskList}
`);

    // Per-task card with spec
    for (const task of input.tasks) {
      const taskSlug = slugify(task.title);
      const taskDir = join(planDir, "tasks", taskSlug);
      mkdirSync(taskDir, { recursive: true });
      writeFileSync(join(taskDir, "task.md"), `---
type: task
title: "${task.title}"
shared: false
description: "Task: ${task.title} (plan: ${slug})"
---

# ${task.title}

${task.spec}
`);
    }

    return `Created plan "${input.title}" with ${input.tasks.length} tasks at ${planDir}`;
  }

  // No tasks yet — skeleton
  writeFileSync(join(planDir, "tasks.md"), `---
type: plan
title: "${input.title} — Tasks"
shared: false
description: "Task breakdown for ${input.title}"
---

# Tasks

<!-- Populate via t.adjust -->
`);

  return `Created plan scaffold "${input.title}" at ${planDir}\nUse t.specify for design, t.adjust for tasks.`;
};
