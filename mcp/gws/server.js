#!/usr/bin/env node

const { execSync } = require("child_process");
const readline = require("readline");

const GWS_CMD = "npx @googleworkspace/cli";

function gws(args, input = null) {
  const opts = {
    encoding: "utf-8",
    timeout: 60000,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, HOME: process.env.GWS_HOME || "/paperclip" },
  };
  if (input) opts.input = input;
  const result = execSync(`${GWS_CMD} ${args}`, opts);
  try {
    return JSON.parse(result);
  } catch {
    return { text: result.trim() };
  }
}

const TOOLS = [
  // --- Drive ---
  {
    name: "drive_list_files",
    description: "List files in Google Drive. Supports search queries (q parameter) and folder listing.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Drive search query (e.g. \"name contains 'report'\" or \"mimeType='application/vnd.google-apps.folder'\")" },
        folder_id: { type: "string", description: "List files in a specific folder by ID" },
        page_size: { type: "integer", description: "Max results per page (default 20)", default: 20 },
      },
    },
  },
  {
    name: "drive_get_file",
    description: "Get metadata for a specific file in Google Drive.",
    inputSchema: {
      type: "object",
      properties: {
        file_id: { type: "string", description: "The Google Drive file ID" },
      },
      required: ["file_id"],
    },
  },
  {
    name: "drive_read_file",
    description: "Export/download a Google Drive file's content as text. Works with Docs, Sheets (CSV), Slides, and text files.",
    inputSchema: {
      type: "object",
      properties: {
        file_id: { type: "string", description: "The Google Drive file ID" },
        mime_type: { type: "string", description: "Export MIME type (e.g. text/plain, text/csv, application/pdf). Defaults to text/plain for Docs." },
      },
      required: ["file_id"],
    },
  },
  {
    name: "drive_create_file",
    description: "Create a new file in Google Drive (Doc, Sheet, Slide, or upload text content).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "File name" },
        mime_type: { type: "string", description: "MIME type (e.g. application/vnd.google-apps.document, application/vnd.google-apps.spreadsheet)" },
        parent_folder_id: { type: "string", description: "Parent folder ID (optional)" },
        content: { type: "string", description: "Text content for the file (optional)" },
      },
      required: ["name"],
    },
  },
  // --- Gmail ---
  {
    name: "gmail_list_messages",
    description: "List Gmail messages. Supports search queries.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query (e.g. \"from:alice subject:report is:unread\")" },
        max_results: { type: "integer", description: "Max messages to return (default 10)", default: 10 },
      },
    },
  },
  {
    name: "gmail_get_message",
    description: "Get a specific Gmail message by ID, including body content.",
    inputSchema: {
      type: "object",
      properties: {
        message_id: { type: "string", description: "The Gmail message ID" },
      },
      required: ["message_id"],
    },
  },
  {
    name: "gmail_send_message",
    description: "Send an email via Gmail.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Email body (plain text)" },
        cc: { type: "string", description: "CC recipients (comma-separated)" },
        bcc: { type: "string", description: "BCC recipients (comma-separated)" },
      },
      required: ["to", "subject", "body"],
    },
  },
  // --- Calendar ---
  {
    name: "calendar_list_events",
    description: "List upcoming calendar events.",
    inputSchema: {
      type: "object",
      properties: {
        calendar_id: { type: "string", description: "Calendar ID (default: primary)", default: "primary" },
        time_min: { type: "string", description: "Start time filter (ISO 8601)" },
        time_max: { type: "string", description: "End time filter (ISO 8601)" },
        max_results: { type: "integer", description: "Max events to return (default 10)", default: 10 },
      },
    },
  },
  {
    name: "calendar_create_event",
    description: "Create a new calendar event.",
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Event title" },
        start: { type: "string", description: "Start time (ISO 8601)" },
        end: { type: "string", description: "End time (ISO 8601)" },
        description: { type: "string", description: "Event description" },
        attendees: { type: "array", items: { type: "string" }, description: "Attendee email addresses" },
        calendar_id: { type: "string", description: "Calendar ID (default: primary)", default: "primary" },
      },
      required: ["summary", "start", "end"],
    },
  },
  // --- Docs ---
  {
    name: "docs_get_document",
    description: "Get a Google Doc's content and metadata.",
    inputSchema: {
      type: "object",
      properties: {
        document_id: { type: "string", description: "The Google Doc ID" },
      },
      required: ["document_id"],
    },
  },
  // --- Sheets ---
  {
    name: "sheets_get_values",
    description: "Read values from a Google Sheets spreadsheet.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "The spreadsheet ID" },
        range: { type: "string", description: "A1 notation range (e.g. Sheet1!A1:D10)" },
      },
      required: ["spreadsheet_id", "range"],
    },
  },
  {
    name: "sheets_update_values",
    description: "Write values to a Google Sheets spreadsheet.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "The spreadsheet ID" },
        range: { type: "string", description: "A1 notation range (e.g. Sheet1!A1:D10)" },
        values: { type: "array", items: { type: "array" }, description: "2D array of values to write" },
      },
      required: ["spreadsheet_id", "range", "values"],
    },
  },
  // --- Tasks ---
  {
    name: "tasks_list",
    description: "List Google Tasks from a task list.",
    inputSchema: {
      type: "object",
      properties: {
        tasklist_id: { type: "string", description: "Task list ID (default: @default)", default: "@default" },
        show_completed: { type: "boolean", description: "Show completed tasks", default: false },
      },
    },
  },
  {
    name: "tasks_create",
    description: "Create a new Google Task.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        notes: { type: "string", description: "Task notes/description" },
        due: { type: "string", description: "Due date (ISO 8601)" },
        tasklist_id: { type: "string", description: "Task list ID (default: @default)", default: "@default" },
      },
      required: ["title"],
    },
  },
];

function escapeJson(obj) {
  return JSON.stringify(JSON.stringify(obj));
}

// ── Agent Permission Enforcement ──
// Maps agent names (lowercase) to allowed tool prefixes.
// If an agent is not listed, ALL tools are blocked.
// Use "*" to allow all tools.
const AGENT_PERMISSIONS = {
  // Marie / Amy: draft-only gmail, calendar, drive
  "marie": ["drive_", "gmail_list_messages", "gmail_get_message", "calendar_", "docs_", "tasks_"],
  "amy": ["drive_", "gmail_list_messages", "gmail_get_message", "calendar_", "docs_", "tasks_"],
  // CEO (Andrew's Desk): full access
  "ceo": ["*"],
  // Engineering Manager: calendar view only
  "engineering manager": ["calendar_list_events"],
  // Research Specialist: drive only
  "research specialist": ["drive_"],
};

// Blocked tools return an error message instead of executing
const BLOCKED_TOOL_MESSAGES = {
  "gmail_send_message": "BLOCKED: You do not have permission to send emails. Draft your email and escalate for approval.",
};

function isToolAllowed(toolName, agentName) {
  if (!agentName) return true; // no agent context = allow (board user)
  const name = agentName.toLowerCase();

  // Try exact match first, then check if name starts with or contains any key
  let perms = AGENT_PERMISSIONS[name];
  if (!perms) {
    // Fuzzy match: check if agent name starts with or contains a known key
    for (const [key, val] of Object.entries(AGENT_PERMISSIONS)) {
      if (name.startsWith(key) || name.includes(key)) {
        perms = val;
        break;
      }
    }
  }
  if (!perms) return false; // agent not listed = block all
  if (perms.includes("*")) return true;
  return perms.some((p) => p.endsWith("_") ? toolName.startsWith(p) : toolName === p);
}

let _resolvedAgentName = null;

async function getAgentName() {
  if (_resolvedAgentName !== null) return _resolvedAgentName || null;

  // Check explicit env var first
  if (process.env.PAPERCLIP_AGENT_NAME || process.env.GWS_AGENT_NAME) {
    _resolvedAgentName = process.env.PAPERCLIP_AGENT_NAME || process.env.GWS_AGENT_NAME;
    return _resolvedAgentName;
  }

  // Resolve from agent ID via Paperclip API
  const agentId = process.env.PAPERCLIP_AGENT_ID;
  const apiUrl = process.env.PAPERCLIP_API_URL || "http://localhost:3100";
  const apiKey = process.env.PAPERCLIP_API_KEY;
  if (agentId && apiKey) {
    try {
      const res = await fetch(`${apiUrl}/api/agents/${agentId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        _resolvedAgentName = data.name || "";
        return _resolvedAgentName || null;
      }
    } catch {}
  }

  _resolvedAgentName = "";
  return null;
}

async function handleToolCall(name, args) {
  // Check permissions
  const agentName = await getAgentName();
  if (agentName && !isToolAllowed(name, agentName)) {
    const msg = BLOCKED_TOOL_MESSAGES[name] || `BLOCKED: Agent "${agentName}" does not have permission to use tool "${name}".`;
    return { error: msg, blocked: true };
  }
  switch (name) {
    // --- Drive ---
    case "drive_list_files": {
      const params = { pageSize: args.page_size || 20 };
      const qParts = [];
      if (args.query) qParts.push(args.query);
      if (args.folder_id) qParts.push(`'${args.folder_id}' in parents`);
      if (qParts.length) params.q = qParts.join(" and ");
      params.fields = "files(id,name,mimeType,modifiedTime,size,parents)";
      return gws(`drive files list --params ${escapeJson(params)}`);
    }

    case "drive_get_file": {
      const params = { fileId: args.file_id, fields: "id,name,mimeType,modifiedTime,size,parents,webViewLink" };
      return gws(`drive files get --params ${escapeJson(params)}`);
    }

    case "drive_read_file": {
      const mimeType = args.mime_type || "text/plain";
      const params = { fileId: args.file_id, mimeType };
      return gws(`drive files export --params ${escapeJson(params)}`);
    }

    case "drive_create_file": {
      const meta = { name: args.name };
      if (args.mime_type) meta.mimeType = args.mime_type;
      if (args.parent_folder_id) meta.parents = [args.parent_folder_id];
      return gws(`drive files create --json ${escapeJson(meta)}`);
    }

    // --- Gmail ---
    case "gmail_list_messages": {
      const params = { userId: "me", maxResults: args.max_results || 10 };
      if (args.query) params.q = args.query;
      return gws(`gmail users messages list --params ${escapeJson(params)}`);
    }

    case "gmail_get_message": {
      const params = { userId: "me", id: args.message_id, format: "full" };
      return gws(`gmail users messages get --params ${escapeJson(params)}`);
    }

    case "gmail_send_message": {
      const headers = [
        `To: ${args.to}`,
        `Subject: ${args.subject}`,
      ];
      if (args.cc) headers.push(`Cc: ${args.cc}`);
      if (args.bcc) headers.push(`Bcc: ${args.bcc}`);
      headers.push("Content-Type: text/plain; charset=utf-8", "", args.body);
      const raw = Buffer.from(headers.join("\r\n")).toString("base64url");
      return gws(`gmail users messages send --params ${escapeJson({ userId: "me" })} --json ${escapeJson({ raw })}`);
    }

    // --- Calendar ---
    case "calendar_list_events": {
      const calId = args.calendar_id || "primary";
      const params = {
        calendarId: calId,
        maxResults: args.max_results || 10,
        singleEvents: true,
        orderBy: "startTime",
      };
      if (args.time_min) params.timeMin = args.time_min;
      if (args.time_max) params.timeMax = args.time_max;
      return gws(`calendar events list --params ${escapeJson(params)}`);
    }

    case "calendar_create_event": {
      const calId = args.calendar_id || "primary";
      const event = {
        summary: args.summary,
        start: { dateTime: args.start },
        end: { dateTime: args.end },
      };
      if (args.description) event.description = args.description;
      if (args.attendees) event.attendees = args.attendees.map((e) => ({ email: e }));
      return gws(`calendar events insert --params ${escapeJson({ calendarId: calId })} --json ${escapeJson(event)}`);
    }

    // --- Docs ---
    case "docs_get_document": {
      return gws(`docs documents get --params ${escapeJson({ documentId: args.document_id })}`);
    }

    // --- Sheets ---
    case "sheets_get_values": {
      return gws(`sheets spreadsheets values get --params ${escapeJson({ spreadsheetId: args.spreadsheet_id, range: args.range })}`);
    }

    case "sheets_update_values": {
      return gws(
        `sheets spreadsheets values update --params ${escapeJson({
          spreadsheetId: args.spreadsheet_id,
          range: args.range,
          valueInputOption: "USER_ENTERED",
        })} --json ${escapeJson({ values: args.values })}`
      );
    }

    // --- Tasks ---
    case "tasks_list": {
      const params = { tasklist: args.tasklist_id || "@default" };
      if (args.show_completed) params.showCompleted = true;
      return gws(`tasks tasks list --params ${escapeJson(params)}`);
    }

    case "tasks_create": {
      const task = { title: args.title };
      if (args.notes) task.notes = args.notes;
      if (args.due) task.due = args.due;
      return gws(`tasks tasks insert --params ${escapeJson({ tasklist: args.tasklist_id || "@default" })} --json ${escapeJson(task)}`);
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
            serverInfo: { name: "gws-mcp", version: "1.0.0" },
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
