// MCP server — exposes reassemble tool to Claude Code via stdio JSON-RPC

import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";
import { loadConfig } from "./config/index.js";
import { mergeDecisions } from "./state/index.js";

const config = loadConfig();
const SIGNAL_PATH = process.env.DECKHAND_SIGNAL_PATH!;

const send = (msg: Record<string, unknown>) => {
  process.stdout.write(JSON.stringify(msg) + "\n");
};

const TOOLS = [
  {
    name: "reassemble",
    description:
      "Clear context and reload with fresh card selection. Call when: context is stale, you need different domain knowledge, or pivoting to a new task. Persists decisions before restarting.",
    inputSchema: {
      type: "object",
      properties: {
        next_input: {
          type: "string",
          description: "The task/focus for the new session",
        },
        decisions: {
          type: "object",
          description: "Key-value pairs to persist across sessions (e.g. {\"auth_method\": \"jwt\"})",
          additionalProperties: true,
        },
        context_hints: {
          type: "array",
          items: { type: "string" },
          description: "Hints for card selection (e.g. [\"needs database schema\", \"auth flow\"])",
        },
      },
      required: ["next_input"],
    },
  },
];

const handleReassemble = (args: { next_input: string; decisions?: Record<string, unknown>; context_hints?: string[] }) => {
  // Persist decisions before restart
  if (args.decisions) {
    mergeDecisions(config.state_dir, "default", args.decisions);
  }

  // Write signal for deckhand parent
  writeFileSync(SIGNAL_PATH, JSON.stringify({
    action: "restart",
    query: args.next_input,
    contextHints: args.context_hints,
    decisions: args.decisions,
  }));

  // Kill claude — deckhand will respawn with fresh cards
  setTimeout(() => process.kill(process.ppid!, "SIGTERM"), 100);

  return "Reassembling — restarting with fresh context...";
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
          serverInfo: { name: "deckhand", version: "0.1.0" },
        },
      });

    case "notifications/initialized":
      return;

    case "tools/list":
      return send({ jsonrpc: "2.0", id: req.id, result: { tools: TOOLS } });

    case "tools/call": {
      const params = req.params as { name: string; arguments?: Record<string, unknown> };
      const args = (params.arguments ?? {}) as Record<string, unknown>;

      let text: string;
      if (params.name === "reassemble") {
        text = handleReassemble(args as Parameters<typeof handleReassemble>[0]);
      } else {
        text = `Unknown tool: ${params.name}`;
      }

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
