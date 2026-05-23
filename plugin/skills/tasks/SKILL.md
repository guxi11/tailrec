---
name: tasks
description: Use when the user asks to "show tasks", "task status", "what's left", "list tasks", or wants to see task completion status.
argument-hint: [plan-slug]
allowed-tools: []
---

# Show Tasks

Call the `t.tasks` MCP tool. If the user provides a plan slug, pass it as `plan`. Otherwise show all plans' task lists.

## Arguments

$ARGUMENTS
