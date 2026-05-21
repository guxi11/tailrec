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
    .name("deckhand")
    .description("Transparent Claude Code wrapper with card-based context injection")
    .version("0.1.0")
    .option("--spec <name>", "Spec name for state", "default")
    .option("--resume", "Resume last claude session")
    .action(async (opts: { spec: string; resume?: boolean }) => {
      const config = loadConfig();
      await startSession(config, opts);
    });

  // deckhand config
  program.addCommand(configCommand());

  // deckhand spec <name>
  program
    .command("spec <name>")
    .description("Create or edit a card")
    .action((name: string) => {
      const config = loadConfig();
      const path = createCard(config.cards_dir, name);
      openInEditor(path);
    });

  // deckhand cards
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

  // deckhand run <task> — non-interactive, single prompt
  program
    .command("run <task>")
    .description("Run a task non-interactively (pipe mode)")
    .option("--spec <name>", "Spec name for state", "default")
    .action(async (task: string, opts: { spec: string }) => {
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

      const exitCode = await spawnTransparent({
        config,
        appendPrompt: result.prompt.appendix,
      });

      const summary = formatExitSummary(sessionUsage);
      if (summary) process.stderr.write(summary + "\n");
      persistUsage(config.state_dir, sessionUsage);
      process.exit(exitCode);
    });

  // deckhand status
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

  // deckhand init
  program
    .command("init")
    .description("Scaffold .deckhand/ in current project")
    .action(() => {
      const dirs = [".deckhand", ".deckhand/cards", ".deckhand/state"];
      for (const dir of dirs) {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      }
      const configPath = ".deckhand/config.yaml";
      if (!existsSync(configPath)) {
        writeFileSync(configPath, stringifyYaml({ backend: "claude", cards_dir: ".deckhand/cards" }));
      }
      console.log("Initialized .deckhand/ structure.");
    });

  return program;
};

