// Per-spec completed tasks persistence

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export interface CompletedTask {
  id: string;
  name: string;
  completedAt: string;
}

const completedPath = (stateDir: string, specName: string): string =>
  join(stateDir, specName, "completed.json");

export const readCompleted = (stateDir: string, specName: string): CompletedTask[] => {
  const p = completedPath(stateDir, specName);
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, "utf-8"));
};

export const markCompleted = (
  stateDir: string,
  specName: string,
  task: Omit<CompletedTask, "completedAt">,
): void => {
  const tasks = readCompleted(stateDir, specName);
  tasks.push({ ...task, completedAt: new Date().toISOString() });
  const p = completedPath(stateDir, specName);
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(p, JSON.stringify(tasks, null, 2));
};
