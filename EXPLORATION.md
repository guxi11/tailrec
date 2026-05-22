# TAILREC PROJECT EXPLORATION

**Repository:** /Users/zyy/develop/Guxi11/deckhand (actually named "tailrec" in package.json)

**Description:** A transparent wrapper for Claude Code that solves context explosion in multi-task sessions using a card-based context injection system.

---

## 1. CARD SYSTEM

### 1.1 Card Loading & Parsing

**File:** `src/cards/workspace.ts`

**Card Format:**
```markdown
---
shared: false
tags: [auth, api]
description: "JWT authentication flow and token lifecycle"
order: 10
[any custom fields]
---

# Card Title

Markdown content with [[wikilinks]] to other cards
```

**Card Metadata (Frontmatter):**
```typescript
interface CardFrontmatter {
  shared?: boolean;           // true = always included (shared)
  tags?: string[];            // optional classification
  description?: string;       // shown to collector for relevance
  order?: number;             // optional for shared_card_sort_key
  [key: string]: unknown;     // extensible
}
```

**Card Structure:**
```typescript
interface Card {
  name: string;              // filename without .md
  path: string;              // full path
  frontmatter: CardFrontmatter;
  body: string;              // markdown content
  links: string[];           // extracted [[wikilinks]]
}
```

**Key Loading Functions:**
- `loadCard(filePath)` — Parse single .md file, extract YAML frontmatter, extract wikilinks
- `loadWorkspace(cardsDir)` — Load all .md files in directory, return sorted array
- `sharedCards(cards)` — Filter cards where `frontmatter.shared === true`
- `taskCards(cards)` — Filter cards where `frontmatter.shared !== true`

**Frontmatter Parsing:**
- YAML block between `---` markers (3-9 lines)
- Fallback to empty frontmatter if parse fails
- Links extracted via regex `/\[\[([^\]]+)\]\]/g`

**Card Creation:**
- `createCard(cardsDir, name)` — Scaffold .md file with template
- Template includes frontmatter skeleton and markdown header
- Opens editor (via `$EDITOR` or vim) for authoring

---

### 1.2 Card Graph & Wikilink Resolution

**File:** `src/cards/graph.ts`

**Graph Structure:**
```typescript
interface CardGraph {
  forward: Map<string, string[]>;   // card → cards it links to
  backward: Map<string, string[]>;  // card → cards that link to it (backlinks)
}
```

**Core Operations:**
- `buildGraph(cards)` — Construct bidirectional link map from all cards
- `forwardLinksOf(graph, name)` — Get outgoing links from a card
- `backlinksOf(graph, name)` — Get incoming links to a card
- `subgraph(graph, root, maxDepth=3)` — BFS traversal to extract connected component

**Subgraph Extraction (BFS):**
- Starts at root card
- Explores both forward and backward links
- Max depth of 3 hops by default
- Used for contextual card discovery around a relevant card

---

### 1.3 Card Directory Structure

**Default:** `.tailrec/cards/` (configurable)

```
.tailrec/cards/
├── auth-flow.md
├── user-schema.md
├── jwt-config.md
├── [shared] database-schema.md (shared: true)
└── [shared] architecture.md (shared: true)
```

**Planned Extension (per plan.md):**
```
.tailrec/cards/
├── plans/
│   └── <plan-title>/
│       ├── plan.md
│       ├── design.md
│       ├── tasks.md
│       └── tasks/
│           └── <task1>/
│               ├── task.md
│               └── input.md
├── features/
├── designs/
└── archive/
```

---

## 2. STATE SYSTEM

### 2.1 Decisions Persistence

**File:** `src/state/decisions.ts`

**Location:** `.tailrec/state/<spec>/decisions.json`

**Type:**
```typescript
type Decisions = Record<string, unknown>;
```

**Example:**
```json
{
  "auth": "jwt",
  "db": "postgres",
  "api_version": "v2",
  "cache_strategy": "redis"
}
```

**Operations:**
- `readDecisions(stateDir, specName)` — Load from JSON, return `{}` if missing
- `writeDecisions(stateDir, specName, decisions)` — Write formatted JSON to file
- `mergeDecisions(stateDir, specName, incoming)` — Deep merge incoming with current, persist

**Semantics:**
- Flat key-value map (no nesting in current implementation)
- Shallow merge (no deep recursive merge)
- Persisted between sessions to maintain architectural continuity
- Included in prompt as Layer 3 (after shared cards, task cards, before current task)

---

### 2.2 Completed Tasks Tracking

**File:** `src/state/completed.ts`

**Location:** `.tailrec/state/<spec>/completed.json`

**Type:**
```typescript
interface CompletedTask {
  id: string;
  name: string;
  completedAt: string;  // ISO timestamp
}
```

**Example:**
```json
[
  {
    "id": "task-001",
    "name": "Set up database schema",
    "completedAt": "2026-05-22T10:30:00Z"
  },
  {
    "id": "task-002",
    "name": "Implement auth endpoints",
    "completedAt": "2026-05-22T11:15:00Z"
  }
]
```

**Operations:**
- `readCompleted(stateDir, specName)` — Load task array, return `[]` if missing
- `markCompleted(stateDir, specName, task)` — Append task with timestamp to array

**Current Usage:**
- CLI command `tailrec status` displays completed tasks
- Not yet auto-generated during session (manual tracking)

---

### 2.3 Usage & Cost Tracking

**Files:** `src/core/usage.ts`, `src/utils/cost.ts`

**Session Structure:**
```typescript
interface SessionUsage {
  entries: UsageEntry[];     // all API calls (collector + claude)
  sessions: AiSession[];     // grouped by iteration
  sessionStart: string;      // ISO timestamp
}

interface AiSession {
  query: string;             // the task/query for this iteration
  entries: UsageEntry[];     // just this iteration's usage
  startedAt: string;         // ISO timestamp
}

interface UsageEntry {
  model: string;             // "claude-sonnet-4-20250514" etc
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  timestamp: string;         // ISO timestamp
}
```

**Location:** `.tailrec/state/usage.json`

**Format:** Array of `SessionUsage` objects (append-only log)

**Pricing Table (`src/utils/cost.ts`):**
```typescript
"claude-sonnet-4-20250514": {
  input_per_mtok: 3,           // $3 per M tokens
  output_per_mtok: 15,         // $15 per M tokens
  cache_read_per_mtok: 0.3,    // 90% discount
  cache_write_per_mtok: 3.75,  // 25% of input
}

"claude-haiku-4-20250514": {
  input_per_mtok: 0.8,
  output_per_mtok: 4,
  cache_read_per_mtok: 0.08,
  cache_write_per_mtok: 1,
}
```

**Cost Calculation:**
```
cost = (input_tokens * input_rate +
        output_tokens * output_rate +
        cache_read_tokens * cache_read_rate +
        cache_write_tokens * cache_write_rate) / 1_000_000
```

**Tracking Flow:**
1. `initSessionUsage()` — Create new session structure with timestamp
2. `startAiSession(usage, query)` — Mark start of new iteration
3. `recordUsage(usage, entry)` — Log a single API call (collector or claude)
4. `persistUsage(stateDir, usage)` — Append to usage.json on exit

**Reporting:**
- `formatUsageSummary()` — Per-session stats (calls, tokens, cache hit %, cost)
- `formatExitSummary()` — Multi-session breakdown
- Example output:
```
Calls: 5
Input: 12,345 tokens
Output: 6,789 tokens
Cache read: 2,000 tokens (14.1% hit rate)
Cache write: 3,000 tokens
Total cost: $0.1234
```

---

## 3. COLLECTOR SYSTEM

**Files:** `src/collector/collector.ts`, `src/collector/prompts.ts`

### 3.1 Input & Output

**Input to `collect()`:**
```typescript
{
  nextInput: string;         // user's task/query
  contextHints?: string[];   // optional hints from previous session
  cards: Card[];             // available task cards (non-shared)
  model: string;             // "claude-haiku-4-20250514" (default)
  apiKey?: string;           // optional, uses env if not provided
}
```

**Output:**
```typescript
interface CollectorResult {
  selectedCards: string[];   // card names in order of relevance
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}
```

**Example:**
```
nextInput: "implement JWT authentication middleware"
contextHints: ["needs user schema", "db connection pool"]
cards: [
  { name: "auth-flow.md", description: "JWT lifecycle...", links: [...] },
  { name: "user-schema.md", description: "User model fields...", links: [...] },
  { name: "middleware-patterns.md", description: "Express middleware...", links: [...] },
  { name: "db-pool.md", description: "Connection pooling...", links: [...] },
  ...
]

→ selectedCards: ["auth-flow.md", "user-schema.md", "db-pool.md"]
```

### 3.2 Collector Prompts

**System Prompt (`COLLECTOR_SYSTEM_PROMPT`):**
```
You are a context selector for a coding assistant. Given a user's next task/input 
and a list of available knowledge cards, select the most relevant cards.

Rules:
- Return ONLY a JSON array of card names, ordered by relevance (most relevant first)
- Select cards that directly help accomplish the stated task
- Follow [[wikilinks]] to include related cards when the link is relevant
- Prefer fewer, more relevant cards over many tangential ones
- Maximum 10 cards unless the task clearly requires more
- If no cards are relevant, return an empty array []
```

**User Prompt Construction (`buildCollectorUserPrompt()`):**
1. **Task section:** nextInput verbatim
2. **Context hints section:** Optional hints from previous session
3. **Available cards section:**
   ```
   - auth-flow.md: JWT lifecycle and token validation → links to: user-schema, middleware-patterns
   - user-schema.md: User model fields and validation → links to: db-pool
   - ...
   ```
4. **Response instruction:** Request JSON array

**Example User Prompt:**
```
## Task
Implement JWT authentication middleware

Context hints from previous session:
- needs user schema
- db connection pool

## Available Cards
- auth-flow.md: JWT lifecycle... → links to: user-schema, middleware-patterns
- user-schema.md: User model... → links to: db-pool
- middleware-patterns.md: Express middleware... → links to: auth-flow
- db-pool.md: Connection pooling... → links to: [none]

## Response
Return a JSON array of card names to include, ordered by relevance.
```

### 3.3 Collector Execution

**Implementation:**
1. Build card index (name, description, links) from task cards
2. Instantiate Anthropic client (uses ANTHROPIC_API_KEY env var)
3. Call `client.messages.create()` with:
   - model: "claude-haiku-4-20250514"
   - max_tokens: 1024
   - system: collector system prompt
   - messages: [{ role: "user", content: user prompt }]
4. Extract JSON array from response via regex `/\[[\s\S]*?\]/`
5. Return selected card names + usage tokens

**Error Handling:**
- Empty card list → return empty result immediately (no API call)
- Parse failure → fallback to empty array
- API error → propagates to caller (caught by reassemble)

---

## 4. PROMPT BUILDER SYSTEM

**File:** `src/core/prompt-builder.ts`

### 4.1 Prompt Assembly Pipeline

**Function:** `buildPrompt(args) → { appendix: string }`

**Layers (in order):**

**Layer 1: Shared Cards (STABLE)**
- All cards with `shared: true`
- Sorted deterministically (by filename or `order` field)
- Always included (cache prefix stability)
- Markup:
```markdown
# Shared Context
## CardName1
[card body 1]

## CardName2
[card body 2]
```

**Layer 2: Task Cards (VARIABLE)**
- Collector-selected cards from taskCards()
- Sorted by collector's relevance ordering
- Includes only when needed for current task
- Markup:
```markdown
# Task Context
## SelectedCard1
[card body]

## SelectedCard2
[card body]
```

**Layer 3: Decisions (VARIABLE)**
- Persisted state from decisions.json
- Formatted as JSON code block with spec name label
- Markup:
```markdown
# Decisions (default)
```json
{
  "auth": "jwt",
  "db": "postgres"
}
```
```

**Layer 4: Current Task (VARIABLE)**
- The user's current input/query
- Markup:
```markdown
# Current Task
Implement JWT authentication middleware
```

**Separator:** Layers joined with `\n---\n` (markdown divider)

### 4.2 Output Format

**Full appendix example:**
```markdown
# Shared Context
## Database Schema
[shared card content...]

## Architecture Patterns
[shared card content...]

---

# Task Context
## Auth Flow
[selected card content...]

## User Schema
[selected card content...]

---

# Decisions (default)
```json
{
  "auth": "jwt",
  "db": "postgres"
}
```
---

# Current Task
Implement JWT authentication endpoints
```

**Usage:**
- Passed to `claude` via `--append-system-prompt <appendix>`
- Claude sees this as additional context after its base system prompt
- Never modifies the appendix; it's static for each session iteration

---

## 5. REASSEMBLE ORCHESTRATION

**File:** `src/core/reassemble.ts`

### 5.1 Reassemble Function

**Called:** At start of each session iteration (and after MCP signal)

**Input:**
```typescript
interface ReassembleInput {
  next_input: string;           // the task for this iteration
  decisions?: Record<string, unknown>;
  context_hints?: string[];
}
```

**Process:**
1. **Persist decisions** — If provided, merge into decisions.json
2. **Load cards** — Load all cards from cardsDir, separate into shared + task
3. **Run collector** — Select relevant task cards for next_input
4. **Record collector usage** — Log API call (Haiku tokens)
5. **Resolve selected cards** — Map collector result names to Card objects
6. **Read persistent decisions** — Load current decisions.json
7. **Build prompt** — Assemble all layers via buildPrompt()
8. **Return** — Prompt appendix + collector usage

**Output:**
```typescript
interface ReassembleResult {
  prompt: AssembledPrompt;  // { appendix: string }
  collectorUsage: { input_tokens: number; output_tokens: number };
}
```

**Error Handling:**
- Missing cardsDir → loadWorkspace() returns []
- Collector fails → propagates error (session aborts)
- Card not found → Silently skipped (shouldn't happen if collector works correctly)

---

## 6. SESSION MANAGEMENT

**Files:** `src/core/session.ts`, `src/cli/repl.ts`

### 6.1 Session Spawning

**Function:** `spawnTransparent(opts) → Promise<SpawnResult>`

**Process:**
1. Generate unique session ID (or reuse if resuming)
2. Write MCP config to `/tmp/tailrec/mcp.json`
3. Build args array: `--mcp-config`, `--append-system-prompt`, `--model`, `--session-id`
4. Spawn `opts.config.backend` (default "claude") with full stdio passthrough
5. Pipe stdout to strip header (Claude Code session header)
6. Wait for exit, return exit code + sessionId

**Key Features:**
- **stdio: "inherit"** for stderr/stdin (true TTY passthrough)
- **stdout: "pipe"** to strip header cleanly
- **No I/O interception** — all user/LLM interaction flows through TTY

**MCP Config:**
```json
{
  "mcpServers": {
    "tailrec": {
      "command": "node",
      "args": ["dist/mcp.js"],
      "env": { "TAILREC_SIGNAL_PATH": "/tmp/tailrec/signal.json" }
    }
  }
}
```

**Args Construction:**
```
claude --mcp-config /tmp/tailrec/mcp.json \
       --append-system-prompt "# Shared Context\n..." \
       --model claude-sonnet-4-20250514 \
       --session-id <uuid> \
       "initial task query"
```

### 6.2 Session Loop (REPL)

**File:** `src/cli/repl.ts` — `startSession(config, opts)`

**Pseudocode:**
```
while true:
  startAiSession(usage, query)    # mark iteration start
  result = reassemble(query)      # select cards, build prompt
  { exitCode, sessionId } = spawnTransparent(result.appendix)
  
  if sessionId:
    entry = readSessionCost(sessionId, config.model)
    recordUsage(usage, entry)
  
  signal = readRestartSignal()    # check for MCP restart
  if signal:
    query = signal.query
    continue                       # restart loop with new query
  else:
    # normal exit
    summary = formatExitSummary(usage)
    persistUsage(usage)
    exit(exitCode)
```

**Restart Signal Path:** `/tmp/tailrec/signal.json`

**Session Cost Lookup:**
- Reads from `~/.claude/projects/<project>/<session-id>.jsonl`
- Parses JSONL lines, extracts `message.usage` fields
- Aggregates usage across all turns in session
- Maps cache_creation_input_tokens → cache_write_tokens
- Maps cache_read_input_tokens → cache_read_tokens

---

## 7. MCP SERVER

**File:** `src/mcp.ts`

### 7.1 MCP Tool Schema

**Tool Name:** `reassemble`

**Input Schema:**
```typescript
{
  type: "object",
  properties: {
    next_input: {
      type: "string",
      description: "The task/focus for the new session"
    },
    decisions: {
      type: "object",
      description: "Key-value pairs to persist across sessions (e.g. {\"auth_method\": \"jwt\"})",
      additionalProperties: true
    },
    context_hints: {
      type: "array",
      items: { type: "string" },
      description: "Hints for card selection (e.g. [\"needs database schema\", \"auth flow\"])"
    }
  },
  required: ["next_input"]
}
```

**Tool Description:**
```
Clear context and reload with fresh card selection. Call when: context is stale, 
you need different domain knowledge, or pivoting to a new task. Persists decisions 
before restarting.
```

### 7.2 MCP Request Handling

**Transport:** stdio JSON-RPC 2.0

**Methods:**
- `initialize` → Return protocol version, server info, capabilities
- `notifications/initialized` → No-op handshake completion
- `tools/list` → Return `[{ name: "reassemble", description: "...", inputSchema: ... }]`
- `tools/call` → Handle tool invocation
  - If `params.name === "reassemble"` → `handleReassemble(args)`
  - Else → Error: "Unknown tool"

### 7.3 Reassemble Handling

**Implementation (`handleReassemble()`):**
1. Merge decisions into decisions.json (if provided)
2. Write signal.json: `{ action: "restart", query, contextHints, decisions }`
3. Kill parent process (claude) via `process.kill(ppid, "SIGTERM")`
4. Return success message

**Signal File Location:** `process.env.TAILREC_SIGNAL_PATH` (set by parent)

**Timing:** 100ms delay before kill (allow MCP response to send)

---

## 8. CONFIG SYSTEM

**Files:** `src/config/schema.ts`, `src/config/loader.ts`

### 8.1 Config Schema

```typescript
interface TailrecConfig {
  backend: string;              // "claude" or custom command
  model: string;                // "claude-sonnet-4-20250514"
  collector_model: string;      // "claude-haiku-4-20250514"
  cards_dir: string;            // ".tailrec/cards"
  state_dir: string;            // ".tailrec/state"
  shared_card_sort_key: "filename" | "frontmatter_order";
}
```

### 8.2 Default Config

```typescript
{
  backend: "claude",
  model: "claude-sonnet-4-20250514",
  collector_model: "claude-haiku-4-20250514",
  cards_dir: ".tailrec/cards",
  state_dir: ".tailrec/state",
  shared_card_sort_key: "filename"
}
```

### 8.3 Config Loading

**Precedence:** DEFAULT → GLOBAL → PROJECT

**Paths:**
- **Global:** `~/.tailrec/config.yaml`
- **Project:** `./.tailrec/config.yaml` (current working directory)

**Format:** YAML

**Example `.tailrec/config.yaml`:**
```yaml
backend: claude-internal
cards_dir: .tailrec/cards
state_dir: .tailrec/state
collector_model: claude-haiku-4-20250514
shared_card_sort_key: filename
```

**Loading Function:**
```typescript
loadConfig(): TailrecConfig
  1. Load global YAML (fallback {})
  2. Load project YAML (fallback {})
  3. Return { ...DEFAULT_CONFIG, ...global, ...project }
```

---

## 9. CLI COMMANDS

**File:** `src/cli/commands.ts`

### 9.1 Commands

| Command | Purpose |
|---------|---------|
| `tailrec [--spec <name>] [--resume]` | Start interactive session with card context |
| `tailrec spec <name>` | Create/edit a card via `$EDITOR` |
| `tailrec cards` | List all cards, show link graph |
| `tailrec run <task>` | Non-interactive single-turn mode |
| `tailrec status [--spec <name>]` | Show decisions.json + completed.json |
| `tailrec init` | Scaffold `.tailrec/` directory structure |
| `tailrec config` | Manage config files |

### 9.2 Default Action

**`tailrec`** (no args):
1. Load config
2. Call `startSession(config, opts)` — enters restart loop
3. Each iteration: reassemble → spawn claude → check signal

---

## 10. DATA FLOW DIAGRAM

```
User Input
    ↓
startSession(config, task)
    ↓
RESTART LOOP:
  ├─ startAiSession(usage, query)     # mark iteration
  ├─ reassemble(query, config)
  │   ├─ loadWorkspace(cardsDir)
  │   ├─ sharedCards() + taskCards()
  │   ├─ collect(query, taskCards)    # Haiku → JSON array
  │   │   └─ recordUsage(collector)
  │   ├─ buildPrompt(shared, selected, decisions, query)
  │   └─ return AssembledPrompt
  │
  ├─ spawnTransparent(config, appendix)
  │   ├─ writeMcpConfig()
  │   ├─ spawn claude with args:
  │   │   --mcp-config /tmp/tailrec/mcp.json
  │   │   --append-system-prompt "<appendix>"
  │   │   --session-id <uuid>
  │   │   "<query>"
  │   ├─ TTY passthrough (stdio: inherit)
  │   └─ return exitCode, sessionId
  │
  ├─ readSessionCost(sessionId) → readSessionFile(~/.claude/projects/*/sessionId.jsonl)
  │   └─ recordUsage(session entry)
  │
  ├─ readRestartSignal() → /tmp/tailrec/signal.json
  │   if exists:
  │     query = signal.query
  │     continue RESTART LOOP
  │   else:
  │     formatExitSummary(usage)
  │     persistUsage(usage)
  │     exit(exitCode)

[INSIDE CLAUDE SESSION]
Claude: [has MCP tool "reassemble" available]
Claude: [does work with context from appendix]
Claude: reassemble({
  next_input: "next task",
  decisions: {...},
  context_hints: [...]
})
  → MCP: writeFileSync(signal.json, {...})
  → MCP: process.kill(parent, SIGTERM)
```

---

## 11. KEY FILES SUMMARY

| File | Lines | Purpose |
|------|-------|---------|
| `src/cards/workspace.ts` | 69 | Load cards, parse frontmatter, extract wikilinks |
| `src/cards/graph.ts` | 49 | Build bidirectional link graph, BFS traversal |
| `src/cards/spec.ts` | 31 | Card creation, editor integration |
| `src/state/decisions.ts` | 38 | Persist/merge architectural decisions |
| `src/state/completed.ts` | 33 | Track completed tasks |
| `src/core/usage.ts` | 99 | Session usage tracking, cost reporting |
| `src/utils/cost.ts` | 56 | Pricing tables, cost calculation |
| `src/collector/collector.ts` | 57 | Call Haiku to select cards |
| `src/collector/prompts.ts` | 40 | Collector system + user prompt templates |
| `src/core/prompt-builder.ts` | 52 | Assemble 4-layer prompt appendix |
| `src/core/reassemble.ts` | 74 | Orchestrate: persist → collect → build |
| `src/core/session.ts` | 132 | Spawn claude, MCP config, header stripping |
| `src/core/session-cost.ts` | 64 | Read usage from Claude session JSONL |
| `src/cli/repl.ts` | 59 | Session loop, restart signal handling |
| `src/cli/commands.ts` | 150 | CLI command definitions (Commander.js) |
| `src/config/schema.ts` | 20 | Config type definitions |
| `src/config/loader.ts` | 28 | Load + merge global/project config |
| `src/mcp.ts` | 118 | MCP server stdio JSON-RPC, reassemble tool |
| `src/index.ts` | 7 | CLI entry point |

---

## 12. FUTURE ROADMAP (per plan.md)

**Planned Features:**
1. Task-based plans with `[[wikilink]]`-based workflow execution
2. MCP tools for plan generation, task tracking, archive
3. Inter-session bridge (small model → handoff summary to next task)
4. Hypothetical cost calculation (simulate single-session O(n²))
5. Subdirectory support for card organization (plans/, features/, designs/, archive/)
6. Task state tracked in card content (not JSON)

---

## 13. EXAMPLE USAGE

### Create a project

```bash
tailrec init
# Creates: .tailrec/config.yaml, .tailrec/cards/, .tailrec/state/
```

### Author cards

```bash
tailrec spec auth-flow
# Opens $EDITOR on .tailrec/cards/auth-flow.md
# Add frontmatter: shared: false, description: "..."
# Add content with [[wikilinks]] to other cards

tailrec spec database-schema
# Create another card
```

### View card graph

```bash
tailrec cards
# Output:
#  Cards (3):
#   auth-flow → links to: database-schema
#   database-schema
#   middleware-patterns → links to: auth-flow
#
#  Backlinks:
#   auth-flow ← middleware-patterns
#   database-schema ← auth-flow
```

### Start interactive session

```bash
tailrec --spec myfeature
# Spawns claude with:
# - Shared cards in Layer 1
# - Collector-selected task cards in Layer 2
# - Empty decisions in Layer 3
# - No Layer 4 yet (no initial task)
#
# Claude interactive mode, full TTY passthrough
# Claude can call reassemble() to restart with new task
```

### Non-interactive mode

```bash
tailrec run "implement JWT authentication"
# Single turn, no restart loop, exits after one session
# Useful for scripting or CI/CD
```

### Check state

```bash
tailrec status --spec myfeature
# Output decisions.json and completed tasks
```

---

## 14. DESIGN PRINCIPLES

1. **Transparent wrapper** — Zero I/O interception, full TTY passthrough
2. **Card-based context** — Knowledge modular, reusable, [[wikilink]]-connected
3. **Deterministic assembly** — Shared cards sorted predictably (cache stability)
4. **Shallow decisions** — Flat JSON key-value map crosses task boundaries
5. **Optional collector** — No cards = degrade to plain wrapper + usage tracking
6. **Session isolation** — Each iteration starts fresh (O(n) tokens, constant quality)
7. **Plain state files** — JSON/YAML, human-readable, git-committable
8. **Small model for selection** — Haiku (faster, cheaper than Sonnet)

