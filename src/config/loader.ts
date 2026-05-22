// Load and merge global + project config

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml } from "yaml";
import { TailrecConfig, DEFAULT_CONFIG } from "./schema.js";

const GLOBAL_CONFIG_PATH = join(homedir(), ".tailrec", "config.yaml");
const PROJECT_CONFIG_PATH = join(process.cwd(), ".tailrec", "config.yaml");

const loadYaml = (path: string): Partial<TailrecConfig> => {
  if (!existsSync(path)) return {};
  try {
    return parseYaml(readFileSync(path, "utf-8")) ?? {};
  } catch {
    return {};
  }
};

export const loadConfig = (): TailrecConfig => {
  const global = loadYaml(GLOBAL_CONFIG_PATH);
  const project = loadYaml(PROJECT_CONFIG_PATH);
  return { ...DEFAULT_CONFIG, ...global, ...project };
};

export const getConfigPath = (scope: "global" | "project"): string =>
  scope === "global" ? GLOBAL_CONFIG_PATH : PROJECT_CONFIG_PATH;
