# CLAUDE.md

## Commands

```bash
npm run build        # Build with tsup (outputs dist/index.js + dist/mcp.js)
npm run dev          # Build in watch mode
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src/
```

## Core Idea

Tailrec is a transparent wrapper around Claude Code. It adds exactly one thing: an MCP server exposing the `reassemble` tool. When Claude calls reassemble, tailrec kills the session, re-selects context cards via a collector (Haiku), assembles a fresh system prompt appendix, and respawns Claude with clean context.

Single-session multi-task produces O(n^2) input tokens and attention dilution; tailrec isolates each task with precisely-dealt context cards, achieving O(n) cost and constant quality.

## Architecture

```
tailrec CLI (transparent wrapper — zero interception of Claude I/O)
│
├── Session Loop (src/cli/repl.ts):
│   while(true): reassemble → spawnTransparent → check signal → loop or exit
│
├── spawnTransparent (src/core/session.ts):
│   spawn claude with stdio:"inherit" (full TTY passthrough)
│   + --mcp-config (inject tailrec MCP server)
│   + --append-system-prompt (card context appendix)
│   + --session-id (force isolated session per iteration)
│
├── MCP Server (src/mcp.ts, separate entry point):
│   stdio JSON-RPC, exposes single tool: reassemble
│   reassemble({ next_input, decisions?, context_hints? })
│     → persist decisions → write signal file → SIGTERM claude
│
├── Reassemble (src/core/reassemble.ts):
│   persist decisions → load cards → collector selects → build appendix
│
├── Collector (src/collector/):
│   Anthropic SDK → Haiku
│   Input: next_input + context_hints + card descriptions
│   Output: ordered card name list
│
├── Prompt Builder (src/core/prompt-builder.ts):
│   Layer 1 [STABLE]: shared cards (shared:true, deterministic sort)
│   Layer 2 [VARIABLE]: collector-selected task cards
│   Layer 3 [VARIABLE]: decisions.json state
│   Layer 4 [VARIABLE]: current task
│
└── State (per-spec, plain JSON):
    ├── decisions.json — cross-task architectural choices
    ├── completed.json — finished task summaries
    └── usage.json — project-global token/cost log
```

## Data Flow

```
$ tailrec [task]
  → reassemble(query) picks cards via collector
  → buildPrompt assembles appendix
  → spawnTransparent(claude --append-system-prompt <appendix> --mcp-config <mcp.json>)
  → claude runs interactively, full TTY passthrough
  → claude calls reassemble tool → MCP server writes signal file → SIGTERM
  → while-loop reads signal → next iteration with fresh cards
  → on normal exit: persist usage, exit
```

## Module Layout

- **`src/cli/`** — Commander.js commands + session restart loop (`repl.ts`)
- **`src/core/`** — Session spawning (`session.ts`), reassemble orchestration (`reassemble.ts`), prompt assembly (`prompt-builder.ts`), usage tracking (`usage.ts`)
- **`src/cards/`** — Markdown card loading with YAML frontmatter, `[[wikilink]]` extraction, bidirectional graph
- **`src/collector/`** — Anthropic SDK call to small model for card selection
- **`src/config/`** — Layered config: `~/.tailrec/config.yaml` (global) merged with `.tailrec/config.yaml` (project)
- **`src/state/`** — Per-spec `decisions.json` and `completed.json` under `.tailrec/state/<spec>/`
- **`src/mcp.ts`** — Standalone MCP stdio server (separate tsup entry point) exposing `reassemble`

## Key Design Decisions

1. **Transparent wrapper**: tailrec spawns claude with `stdio:"inherit"` and never touches I/O. The only integration point is an MCP server injected via `--mcp-config`. Zero compatibility burden with backend updates.
2. **Prefix cache as constraint**: prompt assembly order is deterministic. Shared cards sort by filename. Changing shared card content invalidates cache for all tasks.
3. **Collector is optional**: no cards → skip collector → degrade to plain wrapper with usage tracking.
4. **Backend agnostic**: `backend` config field (`claude` | `codex` | custom command).
5. **State is per-spec, plain files**: human-readable, git-committable. Only `decisions.json` + prior task summary cross task boundaries.
6. **Card granularity**: one card = 200-800 tokens. Collector follows `[[wikilinks]]` for association discovery.

## Card System

- `.md` files in `cards_dir` with YAML frontmatter: `{ shared, tags, description, order? }`
- `shared: true` → always included (Layer 1, deterministic sort)
- `shared: false` (default) → collector-selected per task
- `[[wikilinks]]` create bidirectional graph edges

## Config

`TailrecConfig` fields: `backend`, `model`, `collector_model`, `cards_dir`, `state_dir`, `shared_card_sort_key`. Defaults in `src/config/schema.ts`.

## Build

Two tsup entry points: `src/index.ts` (CLI bin) and `src/mcp.ts` (MCP server bin). Both target Node 20 ESM.
