# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # Build with tsup (outputs dist/index.js + dist/mcp.js)
npm run dev          # Build in watch mode
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src/
```

## Core Idea

Deckhand turns Claude Code from a "stateful long session" into a "stateless function + external state manager." The problem it solves: single-session multi-task produces O(n²) input tokens, uncontrollable compaction, and attention dilution. Deckhand isolates each task with precisely-dealt context cards, achieving O(n) cost and constant quality.

## Architecture

```
deckhand CLI (transparent pipe)
│
├── Session Manager: spawn claude with TTY passthrough + restart loop
│   └── On reassemble signal: kill → re-collect → re-assemble → respawn
│
├── MCP Server (src/mcp.ts): exposes `reassemble` tool via stdio JSON-RPC
│   └── reassemble({ next_input, decisions?, context_hints? })
│       → persist decisions → write signal file → SIGTERM claude
│
├── Collector (Haiku): selects relevant task cards from index
│   └── Input: next_input + context_hints + card descriptions + link graph
│   └── Output: ordered card name list (max 10)
│
├── Prompt Assembly (prefix-cache-first ordering):
│   Layer 1 [STABLE]: shared cards (shared:true, deterministic sort)
│   Layer 2 [VARIABLE]: collector-selected task cards
│   Layer 3 [VARIABLE]: decisions.json state
│   Layer 4 [VARIABLE]: initial task / user message
│
└── State (per-spec, plain JSON files):
    ├── decisions.json — cross-task architectural choices
    ├── completed.json — finished task summaries
    └── usage.json — project-global session token/cost log
```

## Data Flow

```
User invokes `deckhand`
  → reassemble(query) → collector (Haiku) selects cards → prompt-builder assembles appendix
  → spawnTransparent(claude --append-system-prompt <appendix> --mcp-config <mcp.json>)
  → claude runs with deckhand MCP server exposing `reassemble` tool
  → on reassemble tool call: write signal file → SIGTERM claude → while-loop restarts with new cards
```

## Module Layout

- **`src/cli/`** — Commander.js commands + REPL session loop (restart-on-signal while-loop in `repl.ts`)
- **`src/core/`** — Session spawning (`session.ts`), reassemble orchestration (`reassemble.ts`), prompt assembly (`prompt-builder.ts`), usage tracking (`usage.ts`)
- **`src/cards/`** — Markdown card loading with YAML frontmatter, `[[wikilink]]` extraction, bidirectional graph (BFS subgraph)
- **`src/collector/`** — Anthropic SDK call to small model that selects relevant task cards from an index
- **`src/config/`** — Layered config: `~/.deckhand/config.yaml` (global) merged with `.deckhand/config.yaml` (project)
- **`src/state/`** — Per-spec `decisions.json` and `completed.json` under `.deckhand/state/<spec>/`
- **`src/mcp.ts`** — Standalone MCP stdio server (separate tsup entry point) exposing the `reassemble` tool

## Key Design Decisions

1. **Pipe-first**: deckhand is a transparent pipe adding one MCP tool + usage tracking. Zero compatibility burden with backend updates.
2. **Prefix cache as constraint**: prompt assembly order is not arbitrary. Shared cards sort deterministically (filename by default). Changing shared card content invalidates cache for all tasks.
3. **Collector is optional**: no cards → skip collector → degrade to plain wrapper with usage tracking.
4. **Backend agnostic**: `backend` config field (`claude` | `codex` | custom command).
5. **State is per-spec, plain files**: human-readable, git-committable. Only `decisions.json` + prior task summary cross task boundaries — never full history.
6. **Card granularity**: one card = agent single-digestible minimal unit (200-800 tokens). Collector also does association discovery (implicit dependency cards via link graph).

## Card System

- `.md` files in `cards_dir` with YAML frontmatter: `{ shared: bool, tags: [], description: "", order?: number }`
- `shared: true` → always included (Layer 1, deterministic sort)
- `shared: false` (default) → collector-selected per task
- `[[wikilinks]]` create bidirectional graph edges (forward + backlinks auto-computed)
- Collector follows links to include related cards when relevant

## Config

`DeckhandConfig` fields: `backend`, `model`, `collector_model`, `cards_dir`, `state_dir`, `shared_card_sort_key`. Defaults in `src/config/schema.ts`.

## Build

Two tsup entry points: `src/index.ts` (CLI bin with shebang) and `src/mcp.ts` (MCP server bin with shebang). Both target Node 20 ESM.
