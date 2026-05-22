// Card workspace — recursive subdirectory loading with YAML frontmatter

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename, extname, relative } from "node:path";
import { parse as parseYaml } from "yaml";

export interface CardFrontmatter {
  type?: "plan" | "feature" | "design" | "task" | string;
  shared?: boolean;
  tags?: string[];
  description?: string;
  title?: string;
  order?: number;
  [key: string]: unknown;
}

export interface Card {
  name: string;
  path: string;
  relativePath: string; // relative to cards_dir root
  frontmatter: CardFrontmatter;
  body: string;
  links: string[]; // outgoing [[wikilinks]]
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

const parseFrontmatter = (content: string): { frontmatter: CardFrontmatter; body: string } => {
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

const extractLinks = (body: string): string[] => {
  const links: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_RE.exec(body)) !== null) {
    links.push(match[1]!);
  }
  return links;
};

export const loadCard = (filePath: string, cardsDir: string): Card => {
  const content = readFileSync(filePath, "utf-8");
  const { frontmatter, body } = parseFrontmatter(content);
  const name = basename(filePath, extname(filePath));
  const links = extractLinks(body);
  const relativePath = relative(cardsDir, filePath);
  return { name, path: filePath, relativePath, frontmatter, body, links };
};

// Recursively collect all .md files under a directory
const collectMdFiles = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectMdFiles(full));
    } else if (entry.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
};

export const loadWorkspace = (cardsDir: string): Card[] => {
  if (!existsSync(cardsDir)) return [];
  return collectMdFiles(cardsDir)
    .map((f) => loadCard(f, cardsDir))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const sharedCards = (cards: Card[]): Card[] =>
  cards.filter((c) => c.frontmatter.shared === true);

export const taskCards = (cards: Card[]): Card[] =>
  cards.filter((c) => c.frontmatter.shared !== true);

// Filter cards by type field
export const cardsByType = (cards: Card[], type: string): Card[] =>
  cards.filter((c) => c.frontmatter.type === type);

// Find card by name across all subdirectories (wikilink resolution)
export const resolveWikilink = (cards: Card[], linkName: string): Card | undefined =>
  cards.find((c) => c.name === linkName);
