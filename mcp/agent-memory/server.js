#!/usr/bin/env node
/**
 * Agent Memory MCP — Graphiti wrapper with automatic agent-scoped isolation.
 *
 * Every call is scoped to group_id = "agent-{PAPERCLIP_AGENT_ID}".
 * The agent never needs to think about group IDs.
 */

const readline = require("readline");

const GRAPHITI_URL = process.env.GRAPHITI_URL || "http://graphiti:8000";
const AGENT_ID = process.env.PAPERCLIP_AGENT_ID || "";

function getGroupId() {
  if (!AGENT_ID) throw new Error("PAPERCLIP_AGENT_ID not set — cannot scope memory");
  return `agent-${AGENT_ID}`;
}

async function graphitiRequest(path, method = "GET", body = null) {
  const url = `${GRAPHITI_URL}${path}`;
  const options = { method, headers: { "Content-Type": "application/json" } };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graphiti ${method} ${path} failed (${res.status}): ${text}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  const text = await res.text();
  return text ? JSON.parse(text) : { ok: true };
}

const TOOLS = [
  {
    name: "query_brain",
    description:
      "Search your personal knowledge brain. Returns relevant facts, entities, and relationships from documents you've been trained on. Always try this first before searching externally.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What you want to know. Be specific.",
        },
        max_facts: {
          type: "number",
          description: "Maximum facts to return (default 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "remember",
    description:
      "Store new knowledge in your brain. Use this when you discover important facts, complete research, or want to save findings for later. The knowledge is automatically extracted into entities and relationships.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The knowledge to remember. Can be a full document, notes, or key facts.",
        },
        source: {
          type: "string",
          description: "Where this knowledge came from (e.g., 'Q1 Research', 'Task #1234', 'Meeting Notes')",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "recall_context",
    description:
      "Retrieve knowledge relevant to your current conversation. Provide recent messages and get back facts that match the context. Better than query_brain when you have conversation history.",
    inputSchema: {
      type: "object",
      properties: {
        messages: {
          type: "array",
          description: "Recent conversation messages for context",
          items: {
            type: "object",
            properties: {
              role: { type: "string", description: "user or assistant" },
              content: { type: "string", description: "Message text" },
            },
            required: ["role", "content"],
          },
        },
        max_facts: {
          type: "number",
          description: "Maximum facts to return (default 10)",
        },
      },
      required: ["messages"],
    },
  },
  {
    name: "list_memories",
    description:
      "List recent things you've been trained on or remembered. Shows ingestion episodes with timestamps.",
    inputSchema: {
      type: "object",
      properties: {
        last_n: {
          type: "number",
          description: "Number of recent memories to list (default 20)",
        },
      },
    },
  },
  {
    name: "forget_all",
    description:
      "DESTRUCTIVE: Erase your entire brain. Deletes all knowledge, entities, and relationships. Only use if explicitly asked to reset.",
    inputSchema: {
      type: "object",
      properties: {
        confirm: {
          type: "boolean",
          description: "Must be true to confirm deletion",
        },
      },
      required: ["confirm"],
    },
  },
];

async function handleToolCall(name, args) {
  const groupId = getGroupId();

  switch (name) {
    case "query_brain": {
      const result = await graphitiRequest("/search", "POST", {
        query: args.query,
        group_ids: [groupId],
        max_facts: args.max_facts || 10,
      });
      return result;
    }

    case "remember": {
      const uuid = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const result = await graphitiRequest("/messages", "POST", {
        group_id: groupId,
        messages: [
          {
            uuid,
            name: "agent",
            role: args.source || "knowledge",
            role_type: "system",
            content: args.content,
            timestamp: new Date().toISOString(),
            source_description: args.source || "Agent memory",
          },
        ],
      });
      return { stored: true, uuid, group_id: groupId };
    }

    case "recall_context": {
      const messages = (args.messages || []).map((m) => ({
        role_type: m.role === "user" ? "user" : "assistant",
        content: m.content,
      }));
      const result = await graphitiRequest("/get-memory", "POST", {
        group_id: groupId,
        messages,
        max_facts: args.max_facts || 10,
      });
      return result;
    }

    case "list_memories": {
      const lastN = args.last_n || 20;
      const result = await graphitiRequest(`/episodes/${groupId}?last_n=${lastN}`);
      return result;
    }

    case "forget_all": {
      if (!args.confirm) {
        return { error: "Must set confirm: true to erase brain" };
      }
      await graphitiRequest(`/group/${groupId}`, "DELETE");
      return { erased: true, group_id: groupId };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// MCP stdio transport
const rl = readline.createInterface({ input: process.stdin });

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

rl.on("line", async (line) => {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }

  const { id, method, params } = request;

  try {
    switch (method) {
      case "initialize":
        send({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "agent-memory", version: "1.0.0" },
          },
        });
        break;

      case "notifications/initialized":
        break;

      case "tools/list":
        send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
        break;

      case "tools/call": {
        const result = await handleToolCall(params.name, params.arguments || {});
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        });
        break;
      }

      default:
        send({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
    }
  } catch (err) {
    send({
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: err.message },
    });
  }
});
