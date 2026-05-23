---
name: adjust
description: Use when the user asks to "adjust tasks", "reorder tasks", "modify task list", "split a task", "merge tasks", or wants to change a plan's tasks.md.
argument-hint: <new task list in checkbox format>
allowed-tools: []
---

# Adjust Tasks

Call the `t.adjust` MCP tool. The `content` should be in checkbox format: `- [ ] task` / `- [x] done`.

This also creates per-task card directories (`tasks/<slug>/task.md`). If you have detailed specs for individual tasks, call `t.plan` with the full structured JSON instead (which populates task.md with specs).

Optionally pass `plan` if the user specifies which plan.

## Arguments

$ARGUMENTS
