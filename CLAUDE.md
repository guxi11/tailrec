# CLAUDE.md

## Commands

```bash
npm run build        # Build with tsup (outputs dist/index.js + dist/mcp.js)
npm run dev          # Build in watch mode
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src/
```

## Core Idea

Tailrec is a transparent wrapper around any LLM backend (claude, codex, etc). It adds an MCP server exposing `reassemble` + plan management tools (`t.*`). When the backend calls reassemble, tailrec kills the session, re-selects context cards via a collector (Haiku), assembles a fresh system prompt appendix, and respawns with clean context.

Single-session multi-task produces O(n²) input tokens and attention dilution; tailrec isolates each task with precisely-dealt context cards, achieving O(n) cost and constant quality.

## CLI

```
tailrec <backend> [--spec <name>] [--resume]   # Interactive session
tailrec run <backend> <task> [--spec <name>]   # Non-interactive single prompt
tailrec cards                                   # List cards + graph
tailrec spec <name>                            # Create/edit card
tailrec status [--spec <name>]                 # Show decisions + completed
tailrec config get|set|list                    # Manage config
tailrec init                                   # Scaffold .tailrec/
```

Backend is a positional arg (not config). User controls model via backend flags or TUI.

## Architecture

```
tailrec <backend> (transparent wrapper — zero interception of I/O)
│
├── Session Loop (src/cli/repl.ts):
│   while(true): reassemble → spawnTransparent → bridge? → check signal → loop or exit
│
├── spawnTransparent (src/core/session.ts):
│   spawn <backend> with stdio:"inherit" (full TTY passthrough)
│   + --mcp-config (inject tailrec MCP server)
│   + --append-system-prompt (card context appendix)
│   + --session-id (force isolated session per iteration)
│
├── MCP Server (src/mcp.ts + src/mcp/*.ts):
│   stdio JSON-RPC, exposes tools:
│   - reassemble: context reset + card reload
│   - t.plan / t.resume / t.specify / t.adjust / t.tasks / t.start / t.archive / t.cost
│
├── Inter-Session Bridge (src/core/bridge.ts):
│   bridge_model summarizes completed task → writes input.md for next task
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
$ tailrec claude
  → reassemble(query) picks cards via collector
  → buildPrompt assembles appendix
  → spawnTransparent(claude --append-system-prompt <appendix> --mcp-config <mcp.json>)
  → backend runs interactively, full TTY passthrough
  → backend calls reassemble tool → MCP writes signal → SIGTERM
  → if plan active: markTaskDone → runBridge (small model → input.md)
  → while-loop reads signal → next iteration with fresh cards
  → on normal exit: persist usage, exit
```

## Module Layout

- **`src/cli/`** — Commander.js commands + session restart loop (`repl.ts`)
- **`src/core/`** — Session spawning (`session.ts`), reassemble (`reassemble.ts`), prompt assembly (`prompt-builder.ts`), usage tracking (`usage.ts`), inter-session bridge (`bridge.ts`)
- **`src/cards/`** — Recursive card loading with YAML frontmatter, `[[wikilink]]` extraction, bidirectional graph
- **`src/collector/`** — Anthropic SDK call to small model for card selection
- **`src/config/`** — Layered config: `~/.tailrec/config.yaml` (global) merged with `.tailrec/config.yaml` (project)
- **`src/state/`** — Per-spec `decisions.json` and `completed.json` under `.tailrec/state/<spec>/`
- **`src/mcp.ts`** — MCP stdio server entry point (separate tsup entry)
- **`src/mcp/`** — Tool handlers: `plan.ts`, `resume.ts`, `specify.ts`, `adjust.ts`, `tasks.ts`, `start.ts`, `archive.ts`, `cost.ts`

## MCP Tools

| Tool | Purpose |
|------|---------|
| `reassemble` | Kill session, reload cards, respawn with fresh context |
| `t.plan` | Create plan structure: `cards/plans/<slug>/` with plan.md, design.md, tasks.md |
| `t.resume` | List plans or restore task queue from tasks.md |
| `t.specify` | Add constraints to plan's design.md |
| `t.adjust` | Modify task breakdown in tasks.md |
| `t.tasks` | Show task list with completion status |
| `t.start` | Execute next incomplete task (triggers reassemble with task context) |
| `t.archive` | Move plan to archive/, extract design into ground truth cards |
| `t.cost` | Show actual cost vs hypothetical O(n²) single-session cost |

## Key Design Decisions

1. **Transparent wrapper**: tailrec spawns backend with `stdio:"inherit"` and never touches I/O. Only integration: MCP server via `--mcp-config`.
2. **Backend as positional arg**: `tailrec claude`, `tailrec codex` — no config coupling. Model selection delegated to backend.
3. **Prefix cache as constraint**: prompt assembly order is deterministic. Shared cards sort by filename.
4. **Collector is optional**: no cards → skip collector → degrade to plain wrapper with usage tracking.
5. **Inter-session bridge**: small model (bridge_model) summarizes completed session → input.md for next task. Non-fatal on failure.
6. **State is per-spec, plain files**: human-readable, git-committable.
7. **Card granularity**: one card = 200-800 tokens. Collector follows `[[wikilinks]]` for association discovery.
8. **Task tracking in markdown**: tasks.md uses checkbox format (`- [ ]` / `- [x]`), no separate JSON.

## Card System

Cards are `.md` files loaded recursively from `cards_dir` with YAML frontmatter:

```yaml
---
type: plan | feature | design | task   # card type
shared: true | false                    # shared = always in prompt
tags: [...]
description: "..."
title: "..."
order: 1
---
```

Directory structure:
```
.tailrec/cards/
├── plans/<slug>/          # Active plans (plan.md, design.md, tasks.md, tasks/<task>/)
├── features/              # Ground truth feature docs
├── designs/               # Ground truth design decisions
└── archive/plans/         # Archived completed plans
```

`[[wikilinks]]` resolve by name across all subdirectories.

## Config

`TailrecConfig` fields: `collector_model`, `bridge_model`, `cards_dir`, `state_dir`, `shared_card_sort_key`.

Defaults in `src/config/schema.ts`. Merge order: defaults → `~/.tailrec/config.yaml` → `.tailrec/config.yaml`.

## Build

Two tsup entry points: `src/index.ts` (CLI bin) and `src/mcp.ts` (MCP server bin). Both target Node 20 ESM.
