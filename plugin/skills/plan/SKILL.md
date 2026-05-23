---
name: plan
description: Use when the user asks to "create a plan", "plan this", "break down a task", or wants to structure work into cards/plans/. This is an interactive planning protocol — explore code, confirm decisions, then generate.
argument-hint: <PRD, spec, or task description>
allowed-tools: []
---

# Planning Protocol

You are entering planning mode. Do NOT just pass raw text to `t.plan`. Follow this protocol to produce a high-quality, code-aware plan.

## Phase 1: Understand Requirements

Read the PRD/spec provided by the user (via $ARGUMENTS, @-mentioned files, or conversation context). Identify:
- Data models and their fields
- API contracts (endpoints, params, responses, errors)
- UI requirements (pages, components, interactions)
- Constraints (tech stack, conventions, libraries)

## Phase 2: Explore Codebase

Before making any design decisions, explore the existing code:

1. **Project structure**: `find src/ -type f | head -40` — understand the layout
2. **Existing types**: read `src/types/` or wherever types live
3. **Existing patterns**: read 1-2 existing API routes, pages, or components to understand conventions (naming, file structure, error handling patterns, state management)
4. **Dependencies**: check package.json for available libraries
5. **Existing mock data**: if adding mock data, see the existing format

Summarize findings: "The codebase uses [pattern X] for routes, [pattern Y] for components, types are in [location]..."

## Phase 3: Confirm Tech Direction

Ask the user ONE focused question covering the most impactful ambiguity. Examples:
- "The existing routes return `{ data, error }` shape — should feedback routes follow the same, or use the `{ feedback, total }` shape from the PRD?"
- "I see you're using server components with client wrappers — should feedback pages follow the same pattern or be fully client?"
- "No existing pagination pattern found — should I use cursor-based or offset-based?"

If there's no real ambiguity (PRD is clear + codebase conventions are obvious), skip this step and state your assumptions.

## Phase 4: Generate Plan

Call `t.plan` MCP tool with structured JSON as `content`:

```json
{
  "title": "Short plan title",
  "overview": "1-2 sentence goal summary",
  "design": "Full markdown: data models with exact field types, API contracts, UI conventions, shared constants, naming patterns discovered from codebase. This is injected into EVERY task session — be exhaustive on types/shapes.",
  "tasks": [
    {
      "title": "Imperative task title",
      "spec": "Everything needed to implement THIS task: exact file paths to create/modify, field definitions, function signatures, response shapes, validation rules, UI specs. Reference design.md for shared types but include task-specific detail here."
    }
  ]
}
```

### Design doc must include:
- All type/enum definitions (exact field names, types)
- API response shapes
- Status/color mappings
- Validation rules
- File path conventions (discovered from codebase)
- Patterns to follow (discovered from codebase)

### Each task spec must include:
- Exact files to create/modify (based on codebase exploration)
- Implementation detail for THAT task only
- Reference to which types/enums from design.md to use
- Expected behavior including edge cases
- Any codebase-specific patterns to follow

### Task ordering:
Types → Mock data → Backend (API routes) → Frontend (pages/components) → Integration (wiring existing pages)

## Phase 5: Verify

After t.plan succeeds, show the user:
- Task count and titles
- Key design decisions baked in
- Any assumptions made

## Arguments

$ARGUMENTS
