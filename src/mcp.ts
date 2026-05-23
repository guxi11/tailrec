// MCP server — exposes tailrec tools to backend via stdio JSON-RPC

import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";
import { loadConfig } from "./config/index.js";
import { mergeDecisions } from "./state/index.js";
import { handlePlan } from "./mcp/plan.js";
import { handleTasks } from "./mcp/tasks.js";
import { handleResume } from "./mcp/resume.js";
import { handleSpecify } from "./mcp/specify.js";
import { handleAdjust } from "./mcp/adjust.js";
import { handleStart } from "./mcp/start.js";
import { handleArchive } from "./mcp/archive.js";

const config = loadConfig();
const SIGNAL_PATH = process.env.TAILREC_SIGNAL_PATH!;

const send = (msg: Record<string, unknown>) => {
  process.stdout.write(JSON.stringify(msg) + "\n");
};

const TOOLS = [
  {
    name: "reassemble",
    description:
      "Clear context and reload with fresh card selection. Call when: context is stale, you need different domain knowledge, or pivoting to a new task.",
    inputSchema: {
      type: "object",
      properties: {
        next_input: { type: "string", description: "The task/focus for the new session" },
        decisions: { type: "object", description: "Key-value pairs to persist across sessions", additionalProperties: true },
        context_hints: { type: "array", items: { type: "string" }, description: "Hints for card selection" },
      },
      required: ["next_input"],
    },
  },
  {
    name: "t.plan",
    description: "Generate a structured plan with cards. Creates plan.md, design.md, tasks.md under cards/plans/<title>/",
    inputSchema: {
      type: "object",
      properties: { content: { type: "string", description: "Plan description (first line = title)" } },
      required: ["content"],
    },
  },
  {
    name: "t.resume",
    description: "List available plans or restore task queue state for a specific plan.",
    inputSchema: {
      type: "object",
      properties: { plan: { type: "string", description: "Plan slug to resume (optional — lists all if omitted)" } },
    },
  },
  {
    name: "t.specify",
    description: "Add specification/constraints to a plan's design.md.",
    inputSchema: {
      type: "object",
      properties: {
        plan: { type: "string", description: "Plan slug (uses first plan if omitted)" },
        content: { type: "string", description: "Specification content to add" },
      },
      required: ["content"],
    },
  },
  {
    name: "t.adjust",
    description: "Modify task breakdown in a plan's tasks.md (reorder, split, merge, remove).",
    inputSchema: {
      type: "object",
      properties: {
        plan: { type: "string", description: "Plan slug (uses first plan if omitted)" },
        content: { type: "string", description: "New task list in checkbox format: - [ ] task / - [x] done" },
      },
      required: ["content"],
    },
  },
  {
    name: "t.tasks",
    description: "Show task list with completion status for plans.",
    inputSchema: {
      type: "object",
      properties: { plan: { type: "string", description: "Plan slug (shows all if omitted)" } },
    },
  },
  {
    name: "t.start",
    description: "Begin executing the next incomplete task in a plan. Triggers reassemble with task context.",
    inputSchema: {
      type: "object",
      properties: { plan: { type: "string", description: "Plan slug (uses first plan if omitted)" } },
    },
  },
  {
    name: "t.archive",
    description: "Archive a completed plan — moves to archive/, extracts design into ground truth cards.",
    inputSchema: {
      type: "object",
      properties: { plan: { type: "string", description: "Plan slug to archive (uses first plan if omitted)" } },
    },
  },
];

const handleReassemble = (args: { next_input: string; decisions?: Record<string, unknown>; context_hints?: string[] }) => {
  if (args.decisions) {
    mergeDecisions(config.state_dir, "default", args.decisions);
  }

  writeFileSync(SIGNAL_PATH, JSON.stringify({
    action: "restart",
    query: args.next_input,
    contextHints: args.context_hints,
    decisions: args.decisions,
  }));

  setTimeout(() => process.kill(process.ppid!, "SIGTERM"), 100);
  return "Reassembling — restarting with fresh context...";
};

const dispatch = (name: string, args: Record<string, unknown>): string => {
  switch (name) {
    case "reassemble": return handleReassemble(args as Parameters<typeof handleReassemble>[0]);
    case "t.plan": return handlePlan(args as { content: string });
    case "t.resume": return handleResume(args as { plan?: string });
    case "t.specify": return handleSpecify(args as { plan?: string; content: string });
    case "t.adjust": return handleAdjust(args as { plan?: string; content: string });
    case "t.tasks": return handleTasks(args as { plan?: string });
    case "t.start": return handleStart(args as { plan?: string });
    case "t.archive": return handleArchive(args as { plan?: string });
    default: return `Unknown tool: ${name}`;
  }
};

const handleRequest = async (req: { id?: number | string; method: string; params?: Record<string, unknown> }) => {
  switch (req.method) {
    case "initialize":
      return send({
        jsonrpc: "2.0",
        id: req.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "tailrec", version: "0.2.0" },
        },
      });

    case "notifications/initialized":
      return;

    case "tools/list":
      return send({ jsonrpc: "2.0", id: req.id, result: { tools: TOOLS } });

    case "tools/call": {
      const params = req.params as { name: string; arguments?: Record<string, unknown> };
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const text = dispatch(params.name, args);
      return send({
        jsonrpc: "2.0",
        id: req.id,
        result: { content: [{ type: "text", text }] },
      });
    }

    default:
      if (req.id != null) {
        send({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } });
      }
  }
};

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    handleRequest(msg).catch((err) => {
      if (msg.id != null) {
        send({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: String(err) } });
      }
    });
  } catch { /* malformed */ }
});
