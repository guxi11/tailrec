// Per-spec decisions persistence

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export type Decisions = Record<string, unknown>;

const decisionsPath = (stateDir: string, specName: string): string =>
  join(stateDir, specName, "decisions.json");

export const readDecisions = (stateDir: string, specName: string): Decisions => {
  const p = decisionsPath(stateDir, specName);
  if (!existsSync(p)) return {};
  return JSON.parse(readFileSync(p, "utf-8"));
};

export const writeDecisions = (
  stateDir: string,
  specName: string,
  decisions: Decisions,
): void => {
  const p = decisionsPath(stateDir, specName);
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(p, JSON.stringify(decisions, null, 2));
};

export const mergeDecisions = (
  stateDir: string,
  specName: string,
  incoming: Decisions,
): Decisions => {
  const current = readDecisions(stateDir, specName);
  const merged = { ...current, ...incoming };
  writeDecisions(stateDir, specName, merged);
  return merged;
};
