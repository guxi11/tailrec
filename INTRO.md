# Tailrec

Transparent wrapper for Claude Code that solves context explosion in multi-task sessions.

## Problem

Claude Code in a single session accumulates all tool call history in context. Each API turn resends the full messages array — O(n^2) input tokens. Compaction is lossy and uncontrollable. Attention dilutes as context grows; task 10 is worse than task 1.

## Solution

Tailrec wraps Claude Code as a transparent pipe, injecting a single MCP tool: **reassemble**. When Claude decides it needs different context (new task, stale knowledge, domain pivot), it calls reassemble. Tailrec then:

1. Persists any architectural decisions to `decisions.json`
2. Kills the current Claude session
3. Runs a collector (Haiku) to select relevant context cards
4. Assembles a fresh system prompt appendix from selected cards
5. Respawns Claude with clean context and the new task

Each iteration starts with precisely the knowledge it needs — no accumulated history, no compaction artifacts.

## How It Works

```
$ tailrec

# Claude runs normally with full TTY passthrough.
# It has one extra MCP tool: reassemble.
# When it calls reassemble:

Claude: [calls reassemble({ next_input: "implement auth", context_hints: ["jwt", "db schema"] })]
  → tailrec persists decisions
  → tailrec kills claude (SIGTERM)
  → collector selects cards: [auth-flow.md, user-schema.md, jwt-config.md]
  → tailrec respawns claude with fresh card context
  → new session starts with: "implement auth" + relevant cards only
```

## Card System

Knowledge lives in `.md` files with YAML frontmatter:

```yaml
---
shared: false
tags: [auth, api]
description: "JWT authentication flow and token lifecycle"
---

# Auth Flow
...content...
```

- `shared: true` → always included (deterministic order, cache-friendly)
- `shared: false` → collector picks per-task based on relevance
- `[[wikilinks]]` create bidirectional graph edges for association discovery

## State

Per-spec plain JSON files under `.tailrec/state/<spec>/`:

- **decisions.json** — architectural choices that persist across tasks (e.g. `{"auth": "jwt", "db": "postgres"}`)
- **completed.json** — summaries of finished tasks (context for subsequent work)
- **usage.json** — token/cost accounting

## Cost Model

| | Single session (10 tasks) | Tailrec (10 tasks) |
|---|---|---|
| Input token growth | O(n^2) | O(n) |
| Task 10 quality | Degraded (attention dilution) | Same as task 1 |
| Failure recovery | Restart entire session | Re-run single task |

## Name

**tail recursion** — each task is a tail call: the previous frame is discarded, replaced entirely by the next. No stack accumulation.
