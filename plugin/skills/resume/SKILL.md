---
name: resume
description: Use when the user asks to "resume a plan", "list plans", "continue where I left off", or wants to restore task queue state.
argument-hint: [plan-slug]
allowed-tools: []
---

# Resume Plan

Call the `t.resume` MCP tool. If the user provides a plan slug as argument, pass it as `plan`. Otherwise call with no arguments to list all available plans.

## Arguments

$ARGUMENTS
