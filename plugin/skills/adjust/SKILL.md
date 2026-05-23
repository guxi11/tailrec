---
name: adjust
description: Use when the user asks to "adjust tasks", "reorder tasks", "modify task list", "split a task", "merge tasks", or wants to change a plan's tasks.md.
argument-hint: <new task list in checkbox format>
allowed-tools: []
---

# Adjust Tasks

Call the `t.adjust` MCP tool with the user's input as `content`. The content should be in checkbox format: `- [ ] task` / `- [x] done`. Optionally pass `plan` if specified.

## Arguments

$ARGUMENTS
