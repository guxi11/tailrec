# Tailrec Project Exploration - Documentation Index

## 📚 Available Documentation

This folder contains comprehensive documentation of the Tailrec project. Here's where to find what you need:

### Main Documentation Files

1. **EXPLORATION.md** (935 lines)
   - Most comprehensive technical reference
   - 14 major sections with detailed explanations
   - Code examples, data structures, complete workflows
   - **Start here for:** Deep technical understanding, implementation details

2. **CLAUDE.md** (105 lines)
   - Project overview and quick reference
   - Architecture diagram (text-based)
   - Module layout and design decisions
   - **Start here for:** Quick refresher on project structure

3. **EXPLORATION-INDEX.md** (this file)
   - Navigation guide to all documentation
   - Section summaries and cross-references

### Quick Reference Documents (in terminal output)

These are viewable by running the exploration commands:

1. **Architecture Overview Diagram**
   - System components (8 subsystems)
   - Data flow from user input to exit
   - Session restart loop
   - MCP interaction details
   - Prompt assembly pipeline
   - State structure visualization
   - Cost model O(n²) vs O(n)

2. **File Dependency Graph**
   - Module organization (src/ → dist/)
   - Function call relationships
   - Data flow summary
   - Key semantics & invariants

---

## 🎯 System Components

### 1. Card System
**Files:** `src/cards/workspace.ts`, `src/cards/graph.ts`, `src/cards/spec.ts`

**Topics in EXPLORATION.md:**
- Section 1.1: Card Loading & Parsing
- Section 1.2: Card Graph & Wikilink Resolution
- Section 1.3: Card Directory Structure

**Quick Summary:**
- Markdown files with YAML frontmatter
- Bidirectional wikilink graph
- Shared vs task-specific distinction
- BFS traversal for contextual discovery

---

### 2. State System
**Files:** `src/state/decisions.ts`, `src/state/completed.ts`, `src/core/usage.ts`

**Topics in EXPLORATION.md:**
- Section 2.1: Decisions Persistence
- Section 2.2: Completed Tasks Tracking
- Section 2.3: Usage & Cost Tracking

**Quick Summary:**
- Three state layers: decisions, completed, usage
- Per-spec state isolation
- Global usage log
- Append-only architecture

---

### 3. Collector System
**Files:** `src/collector/collector.ts`, `src/collector/prompts.ts`

**Topics in EXPLORATION.md:**
- Section 3.1: Input & Output
- Section 3.2: Collector Prompts
- Section 3.3: Collector Execution

**Quick Summary:**
- Uses Haiku model to select relevant cards
- Input: task + hints, Output: card names (ordered)
- System prompt + user prompt construction
- Regex-based JSON extraction

---

### 4. Prompt Builder
**File:** `src/core/prompt-builder.ts`

**Topics in EXPLORATION.md:**
- Section 4.1: Prompt Assembly Pipeline
- Section 4.2: Output Format

**Quick Summary:**
- 4-layer assembly: Shared + Task + Decisions + Current
- Markdown dividers between layers
- Passed via `--append-system-prompt` flag
- Cache-stable Layer 1

---

### 5. Reassemble Orchestration
**File:** `src/core/reassemble.ts`

**Topics in EXPLORATION.md:**
- Section 5.1: Reassemble Function

**Quick Summary:**
- Entry point called each iteration
- Persist → Collect → Build pipeline
- Returns assembled prompt + usage
- Orchestrates all four systems

---

### 6. Session Management
**Files:** `src/core/session.ts`, `src/core/session-cost.ts`, `src/cli/repl.ts`

**Topics in EXPLORATION.md:**
- Section 6.1: Session Spawning
- Section 6.2: Session Loop (REPL)

**Quick Summary:**
- TTY passthrough spawn
- Restart loop on signal
- Session cost lookup from JSONL
- MCP config injection

---

### 7. MCP Server
**File:** `src/mcp.ts`

**Topics in EXPLORATION.md:**
- Section 7.1: MCP Tool Schema
- Section 7.2: MCP Request Handling
- Section 7.3: Reassemble Handling

**Quick Summary:**
- stdio JSON-RPC 2.0 interface
- Single tool: `reassemble`
- Runs as child of Claude
- Writes signal file + kills parent

---

### 8. Config System
**Files:** `src/config/schema.ts`, `src/config/loader.ts`

**Topics in EXPLORATION.md:**
- Section 8.1: Config Schema
- Section 8.2: Default Config
- Section 8.3: Config Loading

**Quick Summary:**
- YAML-based configuration
- Global + project precedence
- 6 config fields
- Layered merging

---

### 9. CLI Commands
**Files:** `src/cli/commands.ts`, `src/index.ts`

**Topics in EXPLORATION.md:**
- Section 9.1: Commands
- Section 9.2: Default Action

**Quick Summary:**
- 7 main commands
- Commander.js framework
- Interactive and non-interactive modes

---

## 💰 Cost & Performance

**Topics in EXPLORATION.md:**
- Section 10: Data Flow Diagram
- Section 11: Key Files Summary
- Section 12: Future Roadmap
- Section 13: Example Usage
- Section 14: Design Principles

**Cost Analysis:**
- O(n²) → O(n) transformation
- Pricing tables for all models
- Cache hit rate reporting
- Usage breakdown by iteration

---

## 📊 Key Data Structures

### Card
```typescript
{
  name: string,              // filename without .md
  path: string,              // full path
  frontmatter: {
    shared?: boolean,
    tags?: string[],
    description?: string,
    order?: number,
  },
  body: string,              // markdown content
  links: string[],           // extracted [[wikilinks]]
}
```

### CardGraph
```typescript
{
  forward: Map<string, string[]>,   // card → links it creates
  backward: Map<string, string[]>,  // card → cards that link to it
}
```

### Decisions
```typescript
Record<string, unknown>
// Example: { auth: "jwt", db: "postgres" }
```

### SessionUsage
```typescript
{
  entries: UsageEntry[],     // all API calls
  sessions: AiSession[],     // grouped by iteration
  sessionStart: string,      // ISO timestamp
}
```

### UsageEntry
```typescript
{
  model: string,
  input_tokens: number,
  output_tokens: number,
  cache_read_tokens: number,
  cache_write_tokens: number,
  timestamp: string,
}
```

---

## 🔄 Process Flows

### Session Restart Loop
```
while true:
  1. startAiSession()      → Mark iteration
  2. reassemble()          → Collect + build
  3. spawnTransparent()    → Run Claude
  4. readSessionCost()     → Track usage
  5. readRestartSignal()   → Check for restart
     ├─ If signal: continue loop
     └─ If no signal: exit
```

### Reassemble Pipeline
```
reassemble(query):
  1. Persist decisions → decisions.json
  2. Load cards → sharedCards + taskCards
  3. collect(query) → Haiku → card names
  4. buildPrompt() → 4-layer assembly
  5. return prompt + usage
```

### Prompt Assembly
```
appendix = join([
  "# Shared Context" + shared cards,
  "# Task Context" + selected cards,
  "# Decisions" + decisions.json,
  "# Current Task" + user query,
], "\n---\n")
```

---

## 📁 File Organization

```
src/
├── cards/           → Card loading + graph
├── state/           → Decisions, completed, usage
├── collector/       → Haiku card selection
├── core/
│   ├── prompt-builder.ts    → 4-layer assembly
│   ├── reassemble.ts        → Orchestration
│   ├── session.ts           → Spawn + MCP
│   ├── session-cost.ts      → Cost lookup
│   └── usage.ts             → Usage tracking
├── config/          → Config loading
├── utils/           → Cost calculations
├── cli/             → CLI commands
├── mcp.ts           → MCP server
└── index.ts         → Entry point
```

---

## 🎓 Design Principles

1. **Transparent wrapper** — No I/O interception
2. **Card-based context** — Modular, reusable knowledge
3. **Deterministic assembly** — Stable cache prefix
4. **Shallow decisions** — Flat JSON map
5. **Optional collector** — Graceful fallback
6. **Session isolation** — O(n) vs O(n²)
7. **Plain state files** — Git-committable
8. **Small model selection** — Haiku for card selection

---

## 🚀 Getting Started

### For Understanding the Architecture
1. Start with CLAUDE.md (quick overview)
2. Read EXPLORATION.md sections 1-4 (core systems)
3. Review Architecture Overview Diagram

### For Implementation Work
1. Read relevant section in EXPLORATION.md
2. Check File Dependency Graph for cross-module calls
3. Review Key Data Structures for types
4. Study Process Flows for execution order

### For Cost/Performance Analysis
1. Read Section 10 (Cost Model)
2. Review Pricing tables in Section 3
3. Understand O(n²) vs O(n) comparison

### For Future Development
1. Check Section 12 (Future Roadmap)
2. Review plan.md in project root
3. Understand current vs planned card structure

---

## 🔗 Cross-References

### If you need to understand:

**"How are cards loaded?"**
→ EXPLORATION.md Section 1.1 + src/cards/workspace.ts

**"How does the restart loop work?"**
→ EXPLORATION.md Section 6.2 + Architecture Diagram "Session Restart Loop"

**"How is state persisted?"**
→ EXPLORATION.md Section 2 + src/state/*.ts

**"How does the collector select cards?"**
→ EXPLORATION.md Section 3 + src/collector/prompts.ts

**"How are decisions carried between sessions?"**
→ EXPLORATION.md Section 2.1 + src/state/decisions.ts

**"Why is O(n) better than O(n²)?"**
→ EXPLORATION.md Section 10 + Architecture Diagram "Cost Model"

**"What happens when Claude calls reassemble?"**
→ EXPLORATION.md Section 7 + src/mcp.ts

---

## ✅ Verification Checklist

- [x] Card system documented (loading, frontmatter, wikilinks, graph)
- [x] State system documented (decisions, completed, usage)
- [x] Collector system documented (prompts, execution, output)
- [x] Prompt builder documented (4 layers, assembly)
- [x] Session management documented (spawn, loop, cost)
- [x] MCP server documented (tool schema, request handling)
- [x] Config system documented (schema, loading)
- [x] CLI documented (commands, entry points)
- [x] Cost tracking explained (pricing, calculations)
- [x] Architecture diagrams provided (components, flows, dependencies)
- [x] Example usage provided (typical workflow)
- [x] Design principles documented
- [x] Future roadmap included
- [x] All files cross-referenced

---

## 📞 Quick Questions

**Q: Where does the prompt appendix come from?**
A: src/core/prompt-builder.ts assembles it from 4 layers (shared cards + task cards + decisions + current task)

**Q: How does Claude know it can call reassemble?**
A: MCP server (src/mcp.ts) is injected via --mcp-config flag and exposes the "reassemble" tool

**Q: What's in decisions.json?**
A: Flat key-value map of architectural choices: `{ auth: "jwt", db: "postgres" }`

**Q: How is cost tracked?**
A: Two sources: Collector API calls (logged immediately) + Claude session JSONL (read after exit)

**Q: Why restart sessions?**
A: Avoids O(n²) input token growth by starting fresh each iteration with only relevant context

**Q: How are cards selected?**
A: Haiku model evaluates task + card descriptions + wikilinks, returns ordered JSON array

---

Generated: 2026-05-22
Version: Tailrec 0.1.0
