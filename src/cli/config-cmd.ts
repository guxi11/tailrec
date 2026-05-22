// `tailrec config` subcommand

import { Command } from "commander";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { loadConfig, getConfigPath } from "../config/index.js";

export const configCommand = (): Command => {
  const cmd = new Command("config").description("Configure tailrec settings");

  cmd
    .command("get <key>")
    .description("Get a config value")
    .option("--global", "Read from global config")
    .action((key: string, opts: { global?: boolean }) => {
      const config = loadConfig();
      const value = (config as unknown as Record<string, unknown>)[key];
      if (value !== undefined) {
        console.log(`${key} = ${value}`);
      } else {
        console.log(`Key '${key}' not found in config.`);
      }
    });

  cmd
    .command("set <key> <value>")
    .description("Set a config value")
    .option("--global", "Write to global config")
    .action((key: string, value: string, opts: { global?: boolean }) => {
      const scope = opts.global ? "global" : "project";
      const path = getConfigPath(scope);
      const dir = dirname(path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const existing = existsSync(path) ? parseYaml(readFileSync(path, "utf-8")) ?? {} : {};
      existing[key] = value;
      writeFileSync(path, stringifyYaml(existing));
      console.log(`Set ${key} = ${value} (${scope})`);
    });

  cmd
    .command("list")
    .description("Show all resolved config values")
    .action(() => {
      const config = loadConfig();
      console.log("\nResolved config:\n");
      for (const [k, v] of Object.entries(config)) {
        console.log(`  ${k}: ${v}`);
      }
      console.log();
    });

  return cmd;
};
