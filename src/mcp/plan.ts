// MCP tool: t.plan — create plan structure with linked task chain
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
  try {
    const parsed = JSON.parse(content);
    if (parsed.title) return parsed;
  } catch { /* not JSON, treat as plain text */ }

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

  // plan.md — overview (reference only, not used for routing)
  writeFileSync(join(planDir, "plan.md"), `---
type: plan
title: "${input.title}"
shared: false
description: "${input.title}"
---

# ${input.title}

${input.overview ?? ""}
`);

  // design.md — shared constraints (injected into every task session)
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

  // Build linked task chain
  if (input.tasks && input.tasks.length > 0) {
    const slugs = input.tasks.map((t) => slugify(t.title));

    for (let i = 0; i < input.tasks.length; i++) {
      const task = input.tasks[i]!;
      const taskSlug = slugs[i]!;
      const nextSlug = i < input.tasks.length - 1 ? slugs[i + 1]! : null;
      const taskDir = join(planDir, "tasks", taskSlug);
      mkdirSync(taskDir, { recursive: true });

      writeFileSync(join(taskDir, "task.md"), `---
title: "${task.title}"
status: pending
next: ${nextSlug ? `"${nextSlug}"` : "null"}${i === 0 ? "\nhead: true" : ""}
type: task
description: "Task: ${task.title} (plan: ${slug})"
---

# ${task.title}

${task.spec}
`);
    }

    return `Created plan "${input.title}" with ${input.tasks.length} tasks (linked chain) at ${planDir}`;
  }

  return `Created plan scaffold "${input.title}" at ${planDir}\nUse t.adjust to define the task chain.`;
};
