---
name: specify
description: Use when the user asks to "add constraints", "specify requirements", "add to design", or wants to append specification content to a plan's design.md.
argument-hint: <specification content>
allowed-tools: []
---

# Add Specification

Before calling `t.specify`, ensure the content is **implementation-ready**:
1. Cross-reference the existing codebase — use actual file paths, existing type names, real patterns
2. Structure as markdown sections (## Data Model, ## API Contracts, ## Conventions)
3. Be exhaustive on types/enums — exact field names, value types, not summaries
4. Include discovered codebase patterns (naming, file structure, error handling)

If the user provides a raw PRD section, transform it by reading relevant existing code first.

Call the `t.specify` MCP tool with:
- `plan`: plan slug (optional, uses first plan if omitted)
- `content`: structured specification content

## Arguments

$ARGUMENTS
