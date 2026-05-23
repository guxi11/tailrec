---
name: plan
description: Use when the user asks to "create a plan", "plan this", "break down a task", or wants to structure work into plan.md + design.md + tasks.md under cards/plans/.
argument-hint: <plan description>
allowed-tools: []
---

# Plan Creation

Call the `t.plan` MCP tool with the user's input as `content`.

The first line of content becomes the plan title/slug. The tool creates:
- `cards/plans/<slug>/plan.md` — high-level plan
- `cards/plans/<slug>/design.md` — design constraints
- `cards/plans/<slug>/tasks.md` — task breakdown

## Arguments

$ARGUMENTS
