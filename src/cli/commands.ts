// CLI command definitions (Commander.js)

import { Command } from "commander";
import { loadConfig } from "../config/index.js";
import { loadWorkspace, buildGraph, createCard, openInEditor } from "../cards/index.js";
import { readDecisions, readCompleted } from "../state/index.js";
import { initSessionUsage, startAiSession, persistUsage, formatExitSummary } from "../core/usage.js";
import { startSession } from "./repl.js";
import { configCommand } from "./config-cmd.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { stringify as stringifyYaml } from "yaml";

export const createProgram = (): Command => {
  const program = new Command();

  program
    .name("tailrec")
    .description("Transparent LLM wrapper with card-based context injection")
    .version("0.2.0")
    .argument("<backend>", "Backend command (e.g. claude, codex)")
    .option("--spec <name>", "Spec name for state", "default")
    .option("--resume", "Resume last session")
    .action(async (backend: string, opts: { spec: string; resume?: boolean }) => {
      const config = loadConfig();
      await startSession(backend, config, opts);
    });

  // tailrec config
  program.addCommand(configCommand());

  // tailrec spec <name>
  program
    .command("spec <name>")
    .description("Create or edit a card")
    .action((name: string) => {
      const config = loadConfig();
      const path = createCard(config.cards_dir, name);
      openInEditor(path);
    });

  // tailrec cards
  program
    .command("cards")
    .description("List all cards and show link graph")
    .action(() => {
      const config = loadConfig();
      const cards = loadWorkspace(config.cards_dir);
      if (cards.length === 0) {
        console.log("No cards found in", config.cards_dir);
        return;
      }

      const graph = buildGraph(cards);
      console.log(`\n Cards (${cards.length}):\n`);
      for (const card of cards) {
        const shared = card.frontmatter.shared ? " [shared]" : "";
        const links = card.links.length > 0 ? ` → ${card.links.join(", ")}` : "";
        console.log(`  ${card.name}${shared}${links}`);
      }

      const hasBacklinks = [...graph.backward.entries()].filter(([, v]) => v.length > 0);
      if (hasBacklinks.length > 0) {
        console.log("\n Backlinks:\n");
        for (const [target, sources] of hasBacklinks) {
          console.log(`  ${target} ← ${sources.join(", ")}`);
        }
      }
      console.log();
    });

  // tailrec run <backend> <task> — non-interactive, single prompt
  program
    .command("run <backend> <task>")
    .description("Run a task non-interactively (pipe mode)")
    .option("--spec <name>", "Spec name for state", "default")
    .action(async (backend: string, task: string, opts: { spec: string }) => {
      const config = loadConfig();
      const sessionUsage = initSessionUsage();
      const { reassemble } = await import("../core/reassemble.js");
      const { spawnTransparent } = await import("../core/session.js");

      startAiSession(sessionUsage, task);

      const result = await reassemble(
        { next_input: task },
        config,
        opts.spec,
        sessionUsage,
      );

      const { exitCode } = await spawnTransparent({
        backend,
        config,
        appendPrompt: result.prompt.appendix,
      });

      const summary = formatExitSummary(sessionUsage);
      if (summary) process.stderr.write(summary + "\n");
      persistUsage(config.state_dir, sessionUsage);
      process.exit(exitCode);
    });

  // tailrec status
  program
    .command("status")
    .description("Show current state (decisions, completed tasks)")
    .option("--spec <name>", "Spec name", "default")
    .action((opts: { spec: string }) => {
      const config = loadConfig();
      const decisions = readDecisions(config.state_dir, opts.spec);
      const completed = readCompleted(config.state_dir, opts.spec);

      console.log(`\n State for spec: ${opts.spec}\n`);

      if (Object.keys(decisions).length > 0) {
        console.log("Decisions:");
        console.log(JSON.stringify(decisions, null, 2));
      } else {
        console.log("No decisions recorded.");
      }

      if (completed.length > 0) {
        console.log("\nCompleted tasks:");
        for (const t of completed) {
          console.log(`  ✓ ${t.name} (${t.completedAt})`);
        }
      } else {
        console.log("No completed tasks.");
      }
      console.log();
    });

  // tailrec init
  program
    .command("init")
    .description("Scaffold .tailrec/ in current project")
    .action(() => {
      const dirs = [
        ".tailrec",
        ".tailrec/cards",
        ".tailrec/cards/plans",
        ".tailrec/cards/features",
        ".tailrec/cards/designs",
        ".tailrec/state",
      ];
      for (const dir of dirs) {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      }
      const configPath = ".tailrec/config.yaml";
      if (!existsSync(configPath)) {
        writeFileSync(configPath, stringifyYaml({ cards_dir: ".tailrec/cards" }));
      }
      console.log("Initialized .tailrec/ structure.");
    });

  return program;
};
