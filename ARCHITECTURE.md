# Deckhand Project Architecture Deep Dive

**Project Name:** tailrec (in package.json, but directory is "deckhand")  
**Type:** Transparent LLM session wrapper with card-based context assembly  
**Language:** TypeScript (ES2022)  
**Node Version:** ≥20.0.0

---

## 1. CLI Setup & Command Architecture

### Entry Point
- **File:** `src/index.ts` (builds to `dist/index.js`)
- **Banner:** `#!/usr/bin/env node`
- **Package Bin:** `tailrec` → `dist/index.js`

### Commander.js Configuration

**File:** `src/cli/commands.ts` - `createProgram()` returns fully-configured Command instance

**Command Structure:**

```
tailrec [options]                    # Main action: start interactive session
├── config                            # Configuration subcommand group
│   ├── config get <key>             # Get a config value (global/project)
│   ├── config set <key> <value>     # Set a config value (global/project)
│   └── config list                  # Show all resolved config values
├── spec <name>                       # Create or edit a card
├── cards                             # List all cards & show link graph
├── run <task>                        # Run task non-interactively (pipe mode)
├── status [--spec <name>]            # Show current state (decisions, completed tasks)
└── init                              # Scaffold .tailrec/ in current project
```

### Key Options & Arguments Handling

**Main action (`tailrec [options]`):**
- `--spec <name>` (default: "default") - Spec name for state
- `--resume` - Resume last claude session
- `action()` handler: Calls `startSession(config, opts)`

**Backend & Model Handling:**

Currently, `backend` and `model` are **NOT CLI options/arguments**. They are **purely config-driven**:

```typescript
// In session.ts buildArgs():
if (opts.config.model) {
  args.push("--model", opts.config.model);
}
// backend is passed to ptySpawn() directly:
const pty = ptySpawn(resolveBackend(opts.config.backend), args, {...});
```

The backend command is resolved using `which` if it's a bare name:
```typescript
const resolveBackend = (cmd: string): string => {
  if (cmd.startsWith("/") || cmd.startsWith("./")) return cmd;
  try {
    return execSync(`which ${cmd}`, { encoding: "utf-8" }).trim();
  } catch {
    return cmd;
  }
};
```

**Config Scope Merging:**
- Global: `~/.tailrec/config.yaml`
- Project: `.tailrec/config.yaml`
- Merge order: `DEFAULT_CONFIG` → global → project (last wins)

---

## 2. Config Schema & Loading

### Schema Definition

**File:** `src/config/schema.ts`

```typescript
interface TailrecConfig {
  backend: string;                              // Command to spawn (default: "claude")
  model: string;                                // Main session model
  collector_model: string;                      // Haiku for card selection
  cards_dir: string;                            // Path to card workspace
  state_dir: string;                            // Path to state storage
  shared_card_sort_key: "filename" | "frontmatter_order";
}

const DEFAULT_CONFIG: TailrecConfig = {
  backend: "claude",
  model: "claude-sonnet-4-20250514",
  collector_model: "claude-haiku-4-20250514",
  cards_dir: ".tailrec/cards",
  state_dir: ".tailrec/state",
  shared_card_sort_key: "filename",
};
```

### Config Loading

**File:** `src/config/loader.ts` - `loadConfig()` function

```typescript
const GLOBAL_CONFIG_PATH = join(homedir(), ".tailrec", "config.yaml");
const PROJECT_CONFIG_PATH = join(process.cwd(), ".tailrec", "config.yaml");

export const loadConfig = (): TailrecConfig => {
  const global = loadYaml(GLOBAL_CONFIG_PATH);
  const project = loadYaml(PROJECT_CONFIG_PATH);
  return { ...DEFAULT_CONFIG, ...global, ...project };
};
```

**Config Format:** YAML, parsed with `yaml` package

**Example `.tailrec/config.yaml`:**
```yaml
backend: claude
model: claude-sonnet-4-20250514
collector_model: claude-haiku-4-20250514
cards_dir: .tailrec/cards
state_dir: .tailrec/state
shared_card_sort_key: filename
```

---

## 3. Session & REPL Loop

### REPL Entry Point

**File:** `src/cli/repl.ts` - `startSession()` function

```typescript
export const startSession = async (
  config: TailrecConfig,
  opts?: { spec?: string; resume?: boolean; task?: string }
): Promise<void>
```

**Restart Loop Flow:**
```
while (true) {
  1. startAiSession(sessionUsage, query)
  2. reassemble(...) → collects cards, builds prompt
  3. spawnTransparent(...) → launches claude with MCP
  4. readRestartSignal() → check if MCP triggered restart
     → if YES: continue loop with new query
     → if NO: persist usage, exit
}
```

### Session Spawning

**File:** `src/core/session.ts` - `spawnTransparent()` function

**Key Responsibilities:**
1. **Generate Session ID** - `opts.resume ? undefined : randomUUID()`
2. **Build Args** - Calls `buildArgs()` to construct CLI args for `backend` command
3. **Spawn PTY** - Uses `node-pty` to create pseudo-terminal
4. **Strip Header** - Forwards output after detecting header-end pattern (`╰─────╯`)
5. **Forward I/O** - Pipes stdin/stdout and terminal resize events
6. **Capture Exit** - Returns `{ exitCode, sessionId }`

**MCP Configuration File Writing:**
```typescript
const writeMcpConfig = (): string => {
  // Writes to /tmp/tailrec/mcp.json
  return {
    mcpServers: {
      tailrec: {
        command: "node",
        args: [mcpBin],  // dist/mcp.js
        env: { TAILREC_SIGNAL_PATH: /tmp/tailrec/signal.json },
      },
    },
  };
};
```

**Arguments Built by `buildArgs()`:**
```typescript
--mcp-config <path>              # Inject MCP server
--append-system-prompt <text>    # Context cards as system prompt
--model <model>                  # From config.model
--resume                         # Resume flag if opts.resume
--session-id <uuid>              # Fresh session ID
<initialPrompt>                  # Positional arg (user's task)
```

### Session State Storage

**Files:** `.tailrec/state/<spec-name>/`
- `decisions.json` - Persisted decisions across sessions
- `completed.json` - Completed tasks log
- `usage.json` - Token usage history

---

## 4. MCP Server

### Overview

**File:** `src/mcp.ts` (builds to `dist/mcp.js`)

The MCP server runs as a **separate process** spawned by Claude Code's MCP launcher. It implements **stdio JSON-RPC 2.0**.

**Tools Exposed:**
- `reassemble` - Clear context & reload with fresh card selection

### Tool Definition: `reassemble`

```typescript
{
  name: "reassemble",
  description: "Clear context and reload with fresh card selection...",
  inputSchema: {
    type: "object",
    properties: {
      next_input: {
        type: "string",
        description: "The task/focus for the new session",
      },
      decisions: {
        type: "object",
        description: "Key-value pairs to persist (e.g. {\"auth_method\": \"jwt\"})",
        additionalProperties: true,
      },
      context_hints: {
        type: "array",
        items: { type: "string" },
        description: "Hints for card selection",
      },
    },
    required: ["next_input"],
  },
}
```

### Implementation: `handleReassemble()`

```typescript
const handleReassemble = (args: {...}) => {
  // 1. Persist decisions if provided
  if (args.decisions) {
    mergeDecisions(config.state_dir, "default", args.decisions);
  }

  // 2. Write restart signal file
  writeFileSync(SIGNAL_PATH, JSON.stringify({
    action: "restart",
    query: args.next_input,
    contextHints: args.context_hints,
    decisions: args.decisions,
  }));

  // 3. Kill claude process (parent) → tailrec respawns with fresh cards
  setTimeout(() => process.kill(process.ppid!, "SIGTERM"), 100);

  return "Reassembling — restarting with fresh context...";
};
```

### JSON-RPC Handlers

```typescript
handleRequest(req):
  "initialize"              → return protocolVersion, serverInfo
  "notifications/initialized" → no-op
  "tools/list"             → return TOOLS array
  "tools/call"             → route to handleReassemble() or error
```

**Signal File Location:** `TAILREC_SIGNAL_PATH` from env (default: `/tmp/tailrec/signal.json`)

---

## 5. Context Assembly Pipeline

### Reassemble Function

**File:** `src/core/reassemble.ts` - `reassemble()` async function

```typescript
export const reassemble = async (
  input: ReassembleInput,          // { next_input, decisions?, context_hints? }
  config: TailrecConfig,
  specName: string,
  sessionUsage: SessionUsage,
): Promise<ReassembleResult>
```

**Steps:**

1. **Persist Decisions**
   ```typescript
   if (input.decisions) {
     mergeDecisions(config.state_dir, specName, input.decisions);
   }
   ```

2. **Load Cards**
   ```typescript
   const allCards = loadWorkspace(config.cards_dir);
   const shared = sharedCards(allCards);      // frontmatter.shared === true
   const task = taskCards(allCards);          // frontmatter.shared !== true
   ```

3. **Collect Relevant Cards** (using Haiku via Anthropic SDK)
   ```typescript
   const collectorResult = await collect({
     nextInput: input.next_input,
     contextHints: input.context_hints,
     cards: task,
     model: config.collector_model,
   });
   ```

4. **Record Collector Usage**
   ```typescript
   const collectorEntry = {
     model: config.collector_model,
     input_tokens: collectorResult.usage.input_tokens,
     output_tokens: collectorResult.usage.output_tokens,
     cache_read_tokens: 0,
     cache_write_tokens: 0,
     timestamp: new Date().toISOString(),
   };
   recordUsage(sessionUsage, collectorEntry);
   ```

5. **Build System Prompt Appendix**
   ```typescript
   const prompt = buildPrompt({
     sharedCards: shared,
     selectedCards,
     decisions,
     specName,
     initialTask: input.next_input,
   });
   ```

### Card Collector

**File:** `src/collector/collector.ts` - `collect()` function

```typescript
export const collect = async (args: {
  nextInput: string;
  contextHints?: string[];
  cards: Card[];
  model: string;
  apiKey?: string;
}): Promise<CollectorResult>
```

**Mechanism:**
1. Build card index: `[{ name, description, links }, ...]`
2. Call Anthropic SDK with `collector_model`
3. System prompt: `COLLECTOR_SYSTEM_PROMPT` (rules for selection)
4. User prompt: `buildCollectorUserPrompt()` (task + available cards)
5. Extract JSON array from response: `text.match(/\[[\s\S]*?\]/)`
6. Return selected card names and token usage

**Collector System Prompt:**
> "You are a context selector... select the most relevant cards... Follow [[wikilinks]] to include related cards when relevant... Maximum 10 cards unless task clearly requires more..."

### Prompt Builder

**File:** `src/core/prompt-builder.ts` - `buildPrompt()` function

**Assembled Prompt Layers:**
```
# Shared Context          ← All shared cards
  ## Card1
  ## Card2
  ...

---

# Task Context           ← Collector-selected task cards
  ## SelectedCard1
  ## SelectedCard2
  ...

---

# Decisions (spec-name)  ← Persisted decisions JSON
  ```json
  { "auth_method": "jwt", ... }
  ```

---

# Current Task           ← Initial task/user message
  <next_input>
```

---

## 6. Card Workspace & Linking

### Card Structure

**File:** `src/cards/workspace.ts`

```typescript
interface Card {
  name: string;              // Derived from filename (minus .md)
  path: string;              // Full file path
  frontmatter: CardFrontmatter;
  body: string;              // Markdown body (after --- separator)
  links: string[];           // [[wikilinks]] extracted from body
}

interface CardFrontmatter {
  shared?: boolean;          // If true, always included in context
  tags?: string[];
  description?: string;      // Used by collector for selection
  order?: number;
  [key: string]: unknown;
}
```

### Card Parsing

**Card File Format:**
```yaml
---
shared: false
tags: [database, schema]
description: "PostgreSQL schema definitions"
order: 1
---

# Card Name

Markdown body with [[links]] to other cards...
```

**Frontmatter Parser:** YAML, between `---` delimiters  
**Wikilink Extractor:** Regex `\[\[([^\]]+)\]\]`

### Card Graph

**File:** `src/cards/graph.ts`

```typescript
interface CardGraph {
  forward: Map<string, string[]>;   // card → cards it links to
  backward: Map<string, string[]>;  // card → cards that link to it (backlinks)
}

export const buildGraph(cards: Card[]): CardGraph
export const backlinksOf(graph: CardGraph, name: string): string[]
export const forwardLinksOf(graph: CardGraph, name: string): string[]
export const subgraph(graph: CardGraph, root: string, maxDepth = 3): Set<string>
```

**Subgraph Extraction:** BFS traversal up to max depth (default 3)

### Workspace Loading

**File:** `src/cards/workspace.ts` - `loadWorkspace()` function

```typescript
export const loadWorkspace = (cardsDir: string): Card[] => {
  if (!existsSync(cardsDir)) return [];
  return readdirSync(cardsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => loadCard(join(cardsDir, f)))
    .sort((a, b) => a.name.localeCompare(b.name));  // Alphabetical
};
```

**Card Filtering:**
- `sharedCards(cards)` → filter by `frontmatter.shared === true`
- `taskCards(cards)` → filter by `frontmatter.shared !== true`

---

## 7. State Management

### Decisions Persistence

**File:** `src/state/decisions.ts`

```typescript
type Decisions = Record<string, unknown>;

export const readDecisions(stateDir: string, specName: string): Decisions
export const writeDecisions(stateDir: string, specName: string, decisions: Decisions): void
export const mergeDecisions(stateDir: string, specName: string, incoming: Decisions): Decisions
```

**Storage:** `.tailrec/state/<spec-name>/decisions.json`

### Completed Tasks

**File:** `src/state/completed.ts`

```typescript
interface CompletedTask {
  id: string;
  name: string;
  completedAt: string;  // ISO timestamp
}

export const readCompleted(stateDir: string, specName: string): CompletedTask[]
export const markCompleted(stateDir: string, specName: string, task: Omit<CompletedTask, "completedAt">): void
```

**Storage:** `.tailrec/state/<spec-name>/completed.json`

---

## 8. Usage & Cost Tracking

### Session Usage Structure

**File:** `src/core/usage.ts`

```typescript
interface UsageEntry {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  timestamp: string;  // ISO
}

interface AiSession {
  query: string;
  entries: UsageEntry[];  // All API calls for this query
  startedAt: string;
}

interface SessionUsage {
  entries: UsageEntry[];  // Flattened all entries
  sessions: AiSession[];  // Per-query breakdown
  sessionStart: string;
}
```

### Usage Functions

```typescript
export const initSessionUsage(): SessionUsage
export const startAiSession(usage: SessionUsage, query: string): void
export const recordUsage(session: SessionUsage, entry: UsageEntry): void
export const persistUsage(stateDir: string, session: SessionUsage): void
export const formatExitSummary(session: SessionUsage): string
export const formatUsageSummary(session: SessionUsage): string
```

### Session Cost Reading

**File:** `src/core/session-cost.ts` - `readSessionCost()` function

Reads token usage from Claude's session JSONL after exit:
- **Path:** `~/.claude/projects/<project-name>/<session-id>.jsonl`
- **Extracts:** `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`
- **Returns:** Single aggregated `UsageEntry`

### Cost Calculation

**File:** `src/utils/cost.ts`

- `calcCost(entry: UsageEntry)` - Calculate USD cost of entry
- `totalCost(entries: UsageEntry[])` - Sum costs
- `formatCost(cost: number)` - Format as "$X.XX"

**Usage Summary Output:**
```
Calls: 3
Input: 15,042 tokens
Output: 8,391 tokens
Cache read: 2,048 tokens (12.0% hit rate)
Cache write: 4,096 tokens
Total cost: $0.42
```

---

## 9. Build Configuration

### TypeScript Setup

**File:** `tsconfig.json`
- Target: ES2022
- Module: ESNext
- Module Resolution: bundler
- Strict mode: enabled

### Build Pipeline

**File:** `tsup.config.ts`

Two separate build targets:

**1. Main CLI:**
```typescript
entry: "src/index.ts"
format: ["esm"]
banner: "#!/usr/bin/env node"
→ dist/index.js
```

**2. MCP Server:**
```typescript
entry: "src/mcp.ts"
format: ["esm"]
banner: "#!/usr/bin/env node"
→ dist/mcp.js
```

Both:
- Target: node20
- Clean before build
- Generate .d.ts files (main only)

**Package Binaries:**
```json
"bin": {
  "tailrec": "dist/index.js",
  "tailrec-mcp": "dist/mcp.js"
}
```

---

## 10. Dependencies

**Runtime:**
- `@anthropic-ai/sdk` ^0.39.0 - Claude API
- `commander` ^13.0.0 - CLI argument parsing
- `chalk` ^5.4.0 - Terminal colors
- `node-pty` ^1.1.0 - PTY for transparent session spawning
- `yaml` ^2.7.0 - YAML config parsing

**Dev:**
- TypeScript 5.7
- tsup 8.3 (bundler)
- @types/node 22

---

## 11. Data Flow Diagrams

### Session Startup Flow

```
tailrec [--spec name] [--resume]
↓
src/index.ts → createProgram() → parseAsync()
↓
commands.ts → main action() → startSession()
↓
repl.ts → startSession() [restart loop]
  ├─ 1. loadConfig() → TailrecConfig
  ├─ 2. reassemble()
  │    ├─ loadWorkspace(cards_dir)
  │    ├─ collect() → Anthropic Haiku call
  │    ├─ buildPrompt() → appendix
  │    └─ return prompt
  ├─ 3. spawnTransparent()
  │    ├─ writeMcpConfig() → mcp.json
  │    ├─ buildArgs() → CLI args
  │    ├─ ptySpawn(backend, args)
  │    ├─ Forward I/O ↔ terminal
  │    └─ readRestartSignal()
  │         ↓
  │    [MCP triggered restart?]
  │         ├─ YES → continue loop with new query
  │         └─ NO → persist usage, exit
  └─ repeat
```

### MCP Restart Flow

```
Claude in session calls: reassemble(next_input, decisions, context_hints)
↓
mcp.ts → tools/call handler
↓
handleReassemble()
  ├─ mergeDecisions() → .tailrec/state/<spec>/decisions.json
  ├─ writeFileSync() → /tmp/tailrec/signal.json
  └─ process.kill(ppid, SIGTERM) → kill claude
↓
spawnTransparent() receives signal file
↓
readRestartSignal() in repl loop
↓
Loop continues with new query + fresh cards
```

### Context Assembly

```
reassemble() is called
↓
1. Load all cards (.tailrec/cards/*.md)
   ├─ Parse frontmatter (YAML)
   ├─ Extract [[wikilinks]]
   └─ Filter: shared vs task cards
↓
2. Collector selection (Haiku)
   ├─ Build card index
   ├─ Call Anthropic with COLLECTOR_SYSTEM_PROMPT
   └─ Extract JSON array of selected names
↓
3. Prompt builder
   ├─ Layer 1: All shared cards
   ├─ Layer 2: Selected task cards
   ├─ Layer 3: Persisted decisions JSON
   └─ Layer 4: Initial task/query
↓
4. buildArgs() injects appendix via --append-system-prompt
↓
Claude receives as system prompt prepend
```

---

## 12. Key Files Reference

| Path | Purpose |
|------|---------|
| `src/index.ts` | Entry point, CLI bootstrap |
| `src/cli/commands.ts` | Commander.js command definitions |
| `src/cli/repl.ts` | Session REPL loop & restart logic |
| `src/cli/config-cmd.ts` | Config get/set/list subcommands |
| `src/mcp.ts` | MCP server with reassemble tool |
| `src/config/schema.ts` | TailrecConfig interface & defaults |
| `src/config/loader.ts` | Global + project config merging |
| `src/core/session.ts` | PTY spawning & I/O forwarding |
| `src/core/reassemble.ts` | Card collection & prompt assembly |
| `src/core/prompt-builder.ts` | System prompt appendix building |
| `src/core/usage.ts` | Token tracking & cost calculation |
| `src/core/session-cost.ts` | Read usage from Claude's session JSONL |
| `src/cards/workspace.ts` | Card loading & frontmatter parsing |
| `src/cards/graph.ts` | Bidirectional link graph |
| `src/cards/spec.ts` | Card authoring (create, edit) |
| `src/collector/collector.ts` | Anthropic Haiku card selection |
| `src/collector/prompts.ts` | System & user prompts for collector |
| `src/state/decisions.ts` | Persistent decision storage |
| `src/state/completed.ts` | Completed tasks log |
| `src/utils/cost.ts` | Token cost calculations |

---

## 13. Architecture Summary

**Tailrec** is a **session wrapper** that:

1. **Transparently spawns Claude** (or any backend) in a PTY
2. **Injects context cards** as system prompt prepend
3. **Runs an MCP server** inside Claude for restart signaling
4. **Collects relevant cards** using a Haiku language model
5. **Persists decisions** across session restarts
6. **Tracks token usage** and costs

**Key Innovation:** The **MCP-based restart loop** allows Claude to trigger context reassembly without user intervention, enabling dynamic context pivoting within a long-running session.

**Backend & Model Configuration:**
- Both are **config-only** (no CLI args for them)
- Loaded from `~/.tailrec/config.yaml` (global) or `.tailrec/config.yaml` (project)
- Passed to backend command as:
  - `backend`: command to spawn (resolved via `which`)
  - `model`: `--model` flag to backend
  - `collector_model`: Used only for Haiku-based card selection
