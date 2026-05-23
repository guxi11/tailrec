---
name: reassemble
description: Use when the user asks to "reassemble", "reload context", "fresh context", "switch focus", or wants to clear context and reload with fresh card selection.
argument-hint: <next task/focus>
allowed-tools: []
---

# Reassemble Context

Call the `reassemble` MCP tool. Pass the user's input as `next_input` — this becomes the task/focus for the new session. Optionally pass `decisions` (key-value pairs to persist) and `context_hints` (hints for card selection) if the user provides them.

## Arguments

$ARGUMENTS
