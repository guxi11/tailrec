# Tailrec Quick Reference

## Core Concepts

**Tailrec** transparently wraps any backend (default: `claude`) and injects card-based context as a system prompt prepend.

### The Key Innovation
**MCP-based restart loop**: Claude can call `reassemble()` to trigger context reloading with fresh card selection, enabling dynamic pivoting without user intervention.

---

## 1. Commands at a Glance

```bash
# Start interactive session
tailrec [--spec name] [--resume]

# Manage config
tailrec config get/set/list [--global]

# Card authoring
tailrec spec <name>        # Create/edit card
tailrec cards              # List all + show links

# State queries
tailrec status [--spec name]
tailrec run <task>         # Non-interactive mode

# Initialize project
tailrec init               # Create .tailrec/ structure
```

---

## 2. Configuration

### Files
- **Global:** `~/.tailrec/config.yaml`
- **Project:** `.tailrec/config.yaml`
- **Merge order:** defaults → global → project (last wins)

### Keys
```yaml
backend: claude                           # Command to spawn
model: claude-sonnet-4-20250514           # Main session model
collector_model: claude-haiku-4-20250514  # Card selection model
cards_dir: .tailrec/cards                 # Card storage
state_dir: .tailrec/state                 # State storage
shared_card_sort_key: filename            # Card ordering
```

### **Important**: Backend & Model are Config-Only
- No `--backend` or `--model` CLI flags
- Both pulled from config, not command-line
- `backend` resolved via `which` if bare name
- `model` passed as `--model` flag to backend
- `collector_model` used only for Haiku selection

---

## 3. Cards

### File Format
```yaml
---
shared: false              # true = always included
tags: [tag1, tag2]        # Optional metadata
description: "Brief desc" # Used by collector for selection
order: 1                  # Optional ordering
---

# Card Name

Markdown body with [[wikilink]] references...
```

### Storage
- Location: `.tailrec/cards/*.md`
- Loaded alphabetically
- Parsed: frontmatter (YAML) + body + wikilinks

### Card Types
- **Shared cards** (`shared: true`) - Always included in context
- **Task cards** - Selected by Haiku collector based on relevance

---

## 4. Session Flow

```
1. Load config
2. Reassemble
   ├─ Persist decisions (if any)
   ├─ Load cards from disk
   ├─ Call Haiku collector to select relevant task cards
   ├─ Build prompt appendix (shared + selected + decisions + task)
3. Spawn Claude with MCP config
   ├─ Inject MCP server (dist/mcp.js)
   ├─ Pass prompt via --append-system-prompt
   ├─ Forward I/O to terminal
4. Monitor for restart signal
   ├─ If Claude calls reassemble() → loop back to step 2
   ├─ If normal exit → persist usage, exit
```

---

## 5. MCP Server & Restart

### Exposed Tool: `reassemble`

```typescript
reassemble(
  next_input: string,                    // New task
  decisions?: Record<string, unknown>,   // Persist data
  context_hints?: string[]               // Selection hints
): "Reassembling..."
```

### Restart Mechanism
1. Claude calls `reassemble(next_input, ...)`
2. MCP writes signal file: `/tmp/tailrec/signal.json`
3. MCP kills parent process (claude)
4. Tailrec reads signal, loops back to reassemble
5. Fresh cards selected for new task

---

## 6. State Management

### Storage Location
`.tailrec/state/<spec-name>/`

### Files
- **decisions.json** - Persisted decisions: `{ key: value, ... }`
- **completed.json** - Completed tasks: `[{ id, name, completedAt }, ...]`
- **usage.json** - Token/cost history per session

---

## 7. Collector (Card Selection)

### Process
1. Build card index: `[{ name, description, links }, ...]`
2. Call Haiku with system prompt: collection rules
3. User prompt: current task + available cards
4. Extract JSON array: `["Card1", "Card2", ...]`
5. Maximum 10 cards by default (unless task requires more)

### Selection Rules
- Direct relevance to task
- Follow `[[wikilinks]]` when relevant
- Prefer fewer, focused cards
- Can hint with `context_hints`

---

## 8. Usage Tracking

### What's Tracked
- Model name
- Input tokens
- Output tokens
- Cache read tokens
- Cache write tokens
- Timestamp

### Cost Calculation
- Per-model pricing (Sonnet, Haiku, etc.)
- Hit rate: `cache_read / (input + cache_read)`
- Output at end of session: calls, tokens, cost

---

## 9. Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | CLI bootstrap |
| `src/cli/commands.ts` | Commander command defs |
| `src/cli/repl.ts` | Restart loop |
| `src/core/session.ts` | PTY spawning |
| `src/core/reassemble.ts` | Card collection + assembly |
| `src/mcp.ts` | MCP server |
| `src/config/schema.ts` | Config interface |
| `src/cards/workspace.ts` | Card loading |
| `src/collector/collector.ts` | Haiku selection |

---

## 10. Troubleshooting

### "Unknown command" on main action
- Ensure `~/.tailrec/config.yaml` or `.tailrec/config.yaml` exists
- Or configure via: `tailrec config set backend claude`

### MCP not injecting context
- Check `dist/mcp.js` exists (build: `npm run build`)
- Verify TAILREC_SIGNAL_PATH permissions in `/tmp/tailrec/`

### Cards not being selected
- Check card `description` field (used for selection)
- Verify `--spec` name matches (default: "default")
- Look at collector logs for Haiku output

### Context not persisting across sessions
- Use `decisions` parameter in `reassemble()` call
- State stored in `.tailrec/state/<spec-name>/decisions.json`

---

## 11. Example Usage

### Initialize project
```bash
tailrec init
```

### Create a shared context card
```bash
tailrec spec "Project_Overview"
# Editor opens, add:
---
shared: true
description: "Core project overview"
---
## Project Overview
(content)
```

### Create task cards
```bash
tailrec spec "Auth_Flow"
# Add description so Haiku can find it
```

### Start session
```bash
tailrec --spec my-task
```

### Inside Claude, trigger context reload
```
[Calling tool: reassemble]
next_input: "Now work on the database schema"
decisions: { "auth_method": "jwt" }
context_hints: ["needs database schema"]
```

### Check state
```bash
tailrec status --spec my-task
```

### View config
```bash
tailrec config list
tailrec config get model
tailrec config set model claude-opus-4-20250805 --global
```
