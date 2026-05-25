// Task chain utilities — linked-list task traversal via frontmatter `next` field
// Each task.md: { next: "slug", status: "pending" | "done" }

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { loadConfig } from "../config/index.js";

export interface TaskNode {
  slug: string;
  title: string;
  status: "pending" | "done";
  next: string | null; // slug of successor, null = terminal
  spec: string; // body content (task-specific spec)
  path: string; // absolute path to task.md
}

// Parse a single task.md into a TaskNode
export const readTaskNode = (taskMdPath: string, slug: string): TaskNode | null => {
  if (!existsSync(taskMdPath)) return null;
  const raw = readFileSync(taskMdPath, "utf-8");
  const { frontmatter, body } = parseFrontmatter(raw);
  return {
    slug,
    title: (frontmatter.title as string) ?? slug,
    status: (frontmatter.status as "pending" | "done") ?? "pending",
    next: (frontmatter.next as string) ?? null,
    spec: body,
    path: taskMdPath,
  };
};

// Find the head of the chain (first task — frontmatter `head: true` or first alphabetically with no predecessor)
export const findChainHead = (planDir: string): TaskNode | null => {
  const tasksDir = join(planDir, "tasks");
  if (!existsSync(tasksDir)) return null;

  const slugs = readdirSync(tasksDir).filter((d) =>
    existsSync(join(tasksDir, d, "task.md")),
  );

  // Collect all nodes
  const nodes = slugs
    .map((slug) => readTaskNode(join(tasksDir, slug, "task.md"), slug))
    .filter((n): n is TaskNode => n != null);

  // Find the node marked as head
  const head = nodes.find((n) => (n as TaskNode & { _raw?: Record<string, unknown> }).slug &&
    readFrontmatterField(n.path, "head") === true);
  if (head) return head;

  // Fallback: find node that no other node points to as `next`
  const pointedTo = new Set(nodes.map((n) => n.next).filter(Boolean));
  const orphans = nodes.filter((n) => !pointedTo.has(n.slug));
  return orphans[0] ?? nodes[0] ?? null;
};

// Find the current active task (first incomplete in chain starting from head)
export const findCurrentTask = (planDir: string): TaskNode | null => {
  const tasksDir = join(planDir, "tasks");
  let current = findChainHead(planDir);

  while (current) {
    if (current.status !== "done") return current;
    if (!current.next) return null; // chain exhausted
    current = readTaskNode(join(tasksDir, current.next, "task.md"), current.next);
  }
  return null;
};

// Walk the full chain from head, return ordered list
export const walkChain = (planDir: string): TaskNode[] => {
  const tasksDir = join(planDir, "tasks");
  const chain: TaskNode[] = [];
  let current = findChainHead(planDir);
  const seen = new Set<string>();

  while (current && !seen.has(current.slug)) {
    seen.add(current.slug);
    chain.push(current);
    if (!current.next) break;
    current = readTaskNode(join(tasksDir, current.next, "task.md"), current.next);
  }
  return chain;
};

// Mark a task as done
export const markDone = (taskMdPath: string): void => {
  const raw = readFileSync(taskMdPath, "utf-8");
  const updated = replaceFrontmatterField(raw, "status", "done");
  writeFileSync(taskMdPath, updated);
};

// --- public API for other modules ---

// List plan slugs (directories under cards/plans/ that have tasks/)
export const listPlans = (cardsDir: string): string[] => {
  const plansDir = join(cardsDir, "plans");
  if (!existsSync(plansDir)) return [];
  return readdirSync(plansDir).filter((d) =>
    existsSync(join(plansDir, d, "tasks")),
  );
};

// Show task chain status (for t.tasks MCP tool)
export const handleTasks = (args: { plan?: string }): string => {
  const config = loadConfig();
  const plans = listPlans(config.cards_dir);

  if (plans.length === 0) return "No plans found. Use t.plan to create one.";

  const targets = args.plan ? [args.plan] : plans;
  const sections: string[] = [];

  for (const slug of targets) {
    const planDir = join(config.cards_dir, "plans", slug);
    const chain = walkChain(planDir);
    if (chain.length === 0) {
      sections.push(`## ${slug}\nNo tasks defined yet.`);
      continue;
    }
    const done = chain.filter((t) => t.status === "done").length;
    const lines = chain.map((t, i) =>
      `  ${t.status === "done" ? "✓" : i === done ? "→" : "○"} ${t.title}`,
    );
    sections.push(`## ${slug} (${done}/${chain.length})\n${lines.join("\n")}`);
  }

  return sections.join("\n\n");
};

// --- frontmatter helpers ---

const parseFrontmatter = (content: string): { frontmatter: Record<string, unknown>; body: string } => {
  if (!content.startsWith("---")) return { frontmatter: {}, body: content };
  const end = content.indexOf("---", 3);
  if (end === -1) return { frontmatter: {}, body: content };
  const yamlStr = content.slice(3, end).trim();
  const body = content.slice(end + 3).trim();
  try {
    return { frontmatter: parseYaml(yamlStr) ?? {}, body };
  } catch {
    return { frontmatter: {}, body: content };
  }
};

const readFrontmatterField = (path: string, field: string): unknown => {
  const raw = readFileSync(path, "utf-8");
  const { frontmatter } = parseFrontmatter(raw);
  return frontmatter[field];
};

const replaceFrontmatterField = (content: string, field: string, value: unknown): string => {
  if (!content.startsWith("---")) {
    // No frontmatter — add one
    return `---\n${field}: ${JSON.stringify(value)}\n---\n\n${content}`;
  }
  const end = content.indexOf("---", 3);
  if (end === -1) return content;

  const yamlStr = content.slice(3, end).trim();
  const body = content.slice(end + 3);
  const fm = parseYaml(yamlStr) ?? {};
  fm[field] = value;
  return `---\n${stringifyYaml(fm)}---${body}`;
};
