---
name: start
description: Use when the user asks to "start next task", "begin working", "execute next", or wants to trigger the next incomplete task in a plan.
argument-hint: [plan-slug]
allowed-tools: []
---

# Start Next Task

Call the `t.start` MCP tool. If the user provides a plan slug, pass it as `plan`. This triggers reassemble with task-specific context.

## Arguments

$ARGUMENTS
