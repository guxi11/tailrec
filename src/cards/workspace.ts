// Card workspace — init FoamWorkspace over cards_dir
// Note: foam-core may not be available; fallback to manual markdown parsing

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { parse as parseYaml } from "yaml";

export interface CardFrontmatter {
  shared?: boolean;
  tags?: string[];
  description?: string;
  order?: number;
  [key: string]: unknown;
}

export interface Card {
  name: string;
  path: string;
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

export const loadCard = (filePath: string): Card => {
  const content = readFileSync(filePath, "utf-8");
  const { frontmatter, body } = parseFrontmatter(content);
  const name = basename(filePath, extname(filePath));
  const links = extractLinks(body);
  return { name, path: filePath, frontmatter, body, links };
};

export const loadWorkspace = (cardsDir: string): Card[] => {
  if (!existsSync(cardsDir)) return [];
  return readdirSync(cardsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => loadCard(join(cardsDir, f)))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const sharedCards = (cards: Card[]): Card[] =>
  cards.filter((c) => c.frontmatter.shared === true);

export const taskCards = (cards: Card[]): Card[] =>
  cards.filter((c) => c.frontmatter.shared !== true);
