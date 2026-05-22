// `tailrec spec` authoring logic

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const CARD_TEMPLATE = `---
shared: false
tags: []
description: ""
---

# {{name}}

`;

export const createCard = (cardsDir: string, name: string): string => {
  if (!existsSync(cardsDir)) mkdirSync(cardsDir, { recursive: true });
  const filePath = join(cardsDir, `${name}.md`);
  if (existsSync(filePath)) return filePath; // already exists, just open

  const content = CARD_TEMPLATE.replace("{{name}}", name);
  writeFileSync(filePath, content);
  return filePath;
};

export const openInEditor = (filePath: string): void => {
  const editor = process.env["EDITOR"] ?? "vim";
  execSync(`${editor} "${filePath}"`, { stdio: "inherit" });
};
