// MCP server — exposes reassemble tool to Claude Code via stdio JSON-RPC

import { createInterface } from "node:readline";
import { loadConfig } from "./config/index.js";
import { loadWorkspace, sharedCards, taskCards } from "./cards/index.js";
import { collect } from "./collector/index.js";
import { mergeDecisions, readDecisions } from "./state/index.js";

const config = loadConfig();

const send = (msg: Record<string, unknown>) => {
  process.stdout.write(JSON.stringify(msg) + "\n");
};

const handleRequest = async (req: { id: number | string; method: string; params?: Record<string, unknown> }) => {
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
      return; // no response needed

    case "tools/list":
      return send({
        jsonrpc: "2.0",
        id: req.id,
        result: {
          tools: [
            {
              name: "reassemble",
              description:
                "Load relevant knowledge cards into context. Call this when you need domain-specific context (architecture decisions, patterns, schemas) that isn't currently available. The collector selects the most relevant cards based on your query.",
              inputSchema: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "What context you need (e.g. 'database schema', 'auth patterns', 'API routing')",
                  },
                  decisions: {
                    type: "object",
                    description: "Key-value pairs to persist across sessions (e.g. {\"auth_method\": \"jwt\"})",
                    additionalProperties: true,
                  },
                  spec: {
                    type: "string",
                    description: "Spec/workspace name for state isolation (default: 'default')",
                  },
                },
                required: ["query"],
              },
            },
          ],
        },
      });

    case "tools/call": {
      const params = req.params as { name: string; arguments?: Record<string, unknown> };
      if (params.name !== "reassemble") {
        return send({
          jsonrpc: "2.0",
          id: req.id,
          result: { content: [{ type: "text", text: `Unknown tool: ${params.name}` }], isError: true },
        });
      }

      const args = params.arguments as { query: string; decisions?: Record<string, unknown>; spec?: string } | undefined;
      const query = args?.query ?? "general";
      const specName = args?.spec ?? "default";

      // Persist decisions
      if (args?.decisions) {
        mergeDecisions(config.state_dir, specName, args.decisions);
      }

      // Load and select cards
      const allCards = loadWorkspace(config.cards_dir);
      const task = taskCards(allCards);
      const shared = sharedCards(allCards);

      const collectorResult = await collect({
        nextInput: query,
        cards: task,
        model: config.collector_model,
      });

      const selectedCards = collectorResult.selectedCards
        .map((name) => task.find((c) => c.name === name))
        .filter((c): c is NonNullable<typeof c> => c != null);

      // Build response with card contents
      const sections: string[] = [];

      if (shared.length > 0) {
        sections.push(shared.map((c) => `## ${c.name}\n${c.body}`).join("\n\n"));
      }
      if (selectedCards.length > 0) {
        sections.push(selectedCards.map((c) => `## ${c.name}\n${c.body}`).join("\n\n"));
      }

      const decisions = readDecisions(config.state_dir, specName);
      if (Object.keys(decisions).length > 0) {
        sections.push(`## Decisions\n\`\`\`json\n${JSON.stringify(decisions, null, 2)}\n\`\`\``);
      }

      const text = sections.length > 0
        ? sections.join("\n\n---\n")
        : "No relevant cards found.";

      return send({
        jsonrpc: "2.0",
        id: req.id,
        result: { content: [{ type: "text", text }] },
      });
    }

    default:
      return send({
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32601, message: `Method not found: ${req.method}` },
      });
  }
};

// stdio JSON-RPC loop
const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    handleRequest(msg).catch((err) => {
      send({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: String(err) } });
    });
  } catch { /* malformed JSON, ignore */ }
});
