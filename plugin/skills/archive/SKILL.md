---
name: archive
description: Use when the user asks to "archive a plan", "mark plan done", "finish plan", or wants to move a completed plan to archive/.
argument-hint: [plan-slug]
allowed-tools: []
---

# Archive Plan

Call the `t.archive` MCP tool. If the user provides a plan slug, pass it as `plan`. Moves the plan to archive/ and extracts design into ground truth cards.

## Arguments

$ARGUMENTS
