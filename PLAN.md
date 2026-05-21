# Deckhand — Implementation Plan

## Architecture

```
deckhand CLI (TypeScript, Node.js)
│
├── Core: Transparent pipe to configured backend (claude-code / codex / custom)
│   └── Intercepts custom tool calls (reassemble, usage)
│
├── Tools (injected into system prompt):
│   └── reassemble({ next_input, decisions?, context_hints? })
│       → persist decisions → run collector → assemble prompt → restart session
│
├── Commands:
│   ├── deckhand                  — start interactive REPL
│   ├── deckhand spec <name>      — create/edit card (speckit-like authoring)
│   ├── deckhand cards            — list all cards, show link graph
│   ├── deckhand config           — configure backend (claude/codex/custom), model, paths
│   ├── deckhand run <task>       — run a specific task non-interactively
│   ├── deckhand status           — show state (decisions, completed tasks)
│   └── deckhand usage            — show session token/cost breakdown (local, no LLM call)
│
├── Card System (powered by @foam/core):
│   ├── .md files with [[wikilinks]], Obsidian-compatible
│   ├── YAML frontmatter: { shared: bool, tags: [], description: "" }
│   ├── FoamWorkspace: resource management over cards_dir
│   └── FoamGraph: bidirectional link graph (forward + backlinks, auto-computed)
│
├── Collector (Haiku by default):
│   ├── Input: next_input + context_hints + card index + link descriptions
│   ├── Output: ordered card list to inject
│   └── Judges relevance from tool-extracted descriptions
│
├── Prompt Assembly (prefix-cache-first):
│   ├── Layer 1 [STABLE]: system prompt + deckhand rules + tool defs
│   ├── Layer 2 [STABLE]: shared cards (shared:true, deterministic sort)
│   ├── Layer 3 [VARIABLE]: collector-selected task cards
│   └── Layer 4 [VARIABLE]: state (decisions.json) + user message
│
├── Session Manager:
│   ├── Spawns backend process (claude -p / codex / custom)
│   ├── Pipes stdin/stdout transparently
│   ├── Intercepts tool calls from stdout stream
│   ├── On reassemble: kill → collect → assemble → respawn
│   └── Tracks token usage per call
│
├── Config System:
│   ├── ~/.deckhand/config.yaml (global)
│   ├── .deckhand/config.yaml (project)
│   ├── Fields: backend (claude|codex|custom), model, collector_model,
│   │           cards_dir, state_dir, shared_card_sort_key
│   └── `deckhand config set backend codex`
│
└── State (per-spec):
    ├── .deckhand/state/<spec-name>/decisions.json
    ├── .deckhand/state/<spec-name>/completed.json
    └── .deckhand/state/usage.json (project-global session usage log)
```

## Tech Stack

- **Language**: TypeScript (ESM)
- **Runtime**: Node.js 20+
- **CLI framework**: Commander.js (lightweight, no magic)
- **Process management**: node:child_process (spawn, pipe)
- **Card system**: @foam/core (workspace, bidirectional graph, wikilink parsing, frontmatter)
- **Config**: yaml (cosmiconfig pattern)
- **LLM calls (collector)**: Anthropic SDK direct (for Haiku collector calls)
- **Build**: tsup (fast, zero-config bundler)
- **Package**: single bin entry via package.json `"bin"`

## File Structure

```
deckhand/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── README.md
├── LICENSE (MIT)
├── src/
│   ├── index.ts                    — CLI entry point
│   ├── cli/
│   │   ├── commands.ts             — command definitions (commander)
│   │   ├── repl.ts                 — interactive REPL loop
│   │   └── config-cmd.ts           — `deckhand config` subcommand
│   ├── core/
│   │   ├── session.ts              — session manager (spawn, pipe, intercept)
│   │   ├── reassemble.ts           — reassemble tool implementation
│   │   ├── usage.ts                — token/cost tracking
│   │   └── prompt-builder.ts       — layered prompt assembly (cache-aware)
│   ├── cards/
│   │   ├── workspace.ts            — init FoamWorkspace over cards_dir
│   │   ├── graph.ts                — query FoamGraph (backlinks, forward links, subgraph)
│   │   └── spec.ts                 — `deckhand spec` authoring logic
│   ├── collector/
│   │   ├── collector.ts            — collector orchestration
│   │   └── prompts.ts              — collector system/user prompts
│   ├── config/
│   │   ├── schema.ts               — config type definitions
│   │   ├── loader.ts               — load/merge global + project config
│   │   └── defaults.ts             — default config values
│   ├── state/
│   │   ├── decisions.ts            — read/write per-spec decisions.json
│   │   └── completed.ts            — read/write per-spec completed.json
│   └── utils/
│       ├── cost.ts                 — pricing table, cost calculation
│       └── stream.ts               — stream parsing utilities
├── templates/
│   ├── card.md                     — card template for `deckhand spec`
│   └── system-prompt.md            — base system prompt with tool defs
└── .deckhand/
    └── config.yaml                 — example project config
```

## Tasks

### Phase 0: Project Scaffold

- [ ] **T0.1** — Init package.json, tsconfig, tsup, .gitignore, LICENSE (MIT)
- [ ] **T0.2** — README.md (project description, install, quick start, architecture diagram)
- [ ] **T0.3** — CI: GitHub Actions (lint + build + typecheck)

### Phase 1: Config & Card System

- [ ] **T1.1** — Config schema + loader (global ~/.deckhand + project .deckhand)
- [ ] **T1.2** — `deckhand config` command (get/set/list)
- [ ] **T1.3** — Card workspace init (bootstrap @foam/core FoamWorkspace over cards_dir)
- [ ] **T1.4** — Card graph queries (backlinks, forward links, subgraph extraction via FoamGraph)
- [ ] **T1.5** — `deckhand spec` command (create card from template, open in $EDITOR)
- [ ] **T1.6** — `deckhand cards` command (list cards, show graph)

### Phase 2: Core Engine

- [ ] **T2.1** — Session manager (spawn backend process, transparent pipe stdin/stdout)
- [ ] **T2.2** — Tool call interception (parse streaming output, detect custom tool calls)
- [ ] **T2.3** — Prompt builder (layered assembly: system → shared → task → state → message)
- [ ] **T2.4** — Prefix cache ordering logic (deterministic sort for shared cards)

### Phase 3: Collector

- [ ] **T3.1** — Collector module (Anthropic SDK call to Haiku/Sonnet)
- [ ] **T3.2** — Collector prompt design (input: goal + card index + link descriptions → output: ordered card list)
- [ ] **T3.3** — Integration: collector result → prompt builder

### Phase 4: Tools

- [ ] **T4.1** — `reassemble` tool implementation:
  - Parse tool call payload (next_input, decisions?, context_hints?)
  - Persist decisions to state/decisions.json
  - Invoke collector
  - Assemble new prompt
  - Kill current session, respawn with new prompt
  - Return confirmation to new session
- [ ] **T4.2** — System prompt template with reassemble tool definition injected

### Phase 5: CLI Commands

- [ ] **T5.1** — `deckhand` (no args) — start interactive REPL with session manager
- [ ] **T5.2** — `deckhand run <task>` — non-interactive: load task file, assemble, execute, output result
- [ ] **T5.3** — `deckhand status` — show decisions.json + completed tasks
- [ ] **T5.4** — `deckhand usage` / `/usage` — local command, reads wrapper's in-memory token accounting, prints breakdown (calls, tokens, cost, cache hit rate). Zero LLM cost.

### Phase 6: Polish

- [ ] **T6.1** — Error handling (backend crash, collector timeout, invalid cards)
- [ ] **T6.2** — Colored terminal output (tool indicators, reassemble animation)
- [ ] **T6.3** — `deckhand init` — scaffold .deckhand/ in a project
- [ ] **T6.4** — npm publish config, bin entry, shebang

## Key Design Decisions

1. **Pipe-first**: deckhand is a transparent pipe. It adds one tool and tracks usage. Everything else passes through unchanged. This means zero compatibility burden with backend updates.

2. **Prefix cache as constraint**: prompt assembly order is NOT arbitrary. Shared cards get sorted by a deterministic key (filename alphabetical by default, configurable). Changing shared card content invalidates cache for all tasks — this is acceptable but should be rare.

3. **Collector is optional**: if no cards exist or user passes `--no-collect`, skip collector and just pipe directly. Deckhand degrades gracefully to a plain wrapper with usage tracking.

4. **Backend agnostic**: config specifies `backend: claude | codex | custom`. Custom allows arbitrary command. Tool interception protocol may differ per backend — start with claude-code's JSON tool call format, add codex later.

5. **State is per-spec, plain files**: each spec gets its own decisions.json and completed.json under `.deckhand/state/<spec-name>/`. Human-readable, git-committable. Decisions track choices made *for that spec* through its task lifecycle. Usage remains project-global.

6. **Card system delegates to @foam/core**: no custom parser or index builder. FoamWorkspace handles resource management, FoamGraph provides the bidirectional link graph. We query it, not rebuild it.
