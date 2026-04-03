#!/usr/bin/env node

const readline = require("readline");

const PAPERCLIP_API_URL = process.env.PAPERCLIP_API_URL || "http://localhost:3100";
const PAPERCLIP_API_KEY = process.env.PAPERCLIP_API_KEY || "";
const PAPERCLIP_COMPANY_ID = process.env.PAPERCLIP_COMPANY_ID || "";

async function apiRequest(path, method = "GET", body = null) {
  const url = `${PAPERCLIP_API_URL}/api${path}`;
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };
  if (PAPERCLIP_API_KEY) {
    options.headers["Authorization"] = `Bearer ${PAPERCLIP_API_KEY}`;
  }
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paperclip API error ${res.status}: ${text}`);
  }
  return res.json();
}

function resolveCompanyId(args) {
  return args.company_id || PAPERCLIP_COMPANY_ID;
}

const TOOLS = [
  {
    name: "list_documents",
    description:
      "List the full document tree for the current company. Returns all folders and files in the document library.",
    inputSchema: {
      type: "object",
      properties: {
        company_id: {
          type: "string",
          description:
            "Company ID (defaults to PAPERCLIP_COMPANY_ID env var)",
        },
        search: {
          type: "string",
          description: "Optional search query to filter files by name",
        },
      },
    },
  },
  {
    name: "search_documents",
    description:
      "Search for documents by name across all folders in the company document tree.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term" },
        company_id: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "read_document",
    description:
      "Read the content of a document by its asset ID. Returns text content for text-based files or base64 for binary files.",
    inputSchema: {
      type: "object",
      properties: {
        asset_id: {
          type: "string",
          description: "The asset ID of the document to read",
        },
      },
      required: ["asset_id"],
    },
  },
  {
    name: "upload_document",
    description:
      "Create a new document in a folder from text content. Use this to save reports, notes, or generated content.",
    inputSchema: {
      type: "object",
      properties: {
        folder_id: {
          type: "string",
          description: "Target folder ID",
        },
        filename: {
          type: "string",
          description: "File name (e.g. 'report.md', 'notes.txt')",
        },
        content: {
          type: "string",
          description: "Text content of the document",
        },
        company_id: { type: "string" },
      },
      required: ["folder_id", "filename", "content"],
    },
  },
  {
    name: "move_document",
    description: "Move a document to a different folder.",
    inputSchema: {
      type: "object",
      properties: {
        file_id: {
          type: "string",
          description: "The doc_folder_file ID to move",
        },
        target_folder_id: {
          type: "string",
          description: "Destination folder ID",
        },
        company_id: { type: "string" },
      },
      required: ["file_id", "target_folder_id"],
    },
  },
  {
    name: "create_folder",
    description: "Create a new subfolder in the document tree.",
    inputSchema: {
      type: "object",
      properties: {
        parent_id: {
          type: "string",
          description: "Parent folder ID (null for root)",
        },
        name: {
          type: "string",
          description: "Folder name",
        },
        company_id: { type: "string" },
      },
      required: ["name"],
    },
  },
];

async function handleToolCall(name, args) {
  const companyId = resolveCompanyId(args);

  switch (name) {
    case "list_documents": {
      const search = args.search ? `?search=${encodeURIComponent(args.search)}` : "";
      return apiRequest(`/companies/${companyId}/doc-tree${search}`);
    }

    case "search_documents": {
      return apiRequest(
        `/companies/${companyId}/doc-tree?search=${encodeURIComponent(args.query)}`,
      );
    }

    case "read_document": {
      const url = `${PAPERCLIP_API_URL}/api/assets/${args.asset_id}/content`;
      const headers = {};
      if (PAPERCLIP_API_KEY) {
        headers["Authorization"] = `Bearer ${PAPERCLIP_API_KEY}`;
      }
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to read document: ${res.status} ${text}`);
      }
      const ct = res.headers.get("content-type") || "";
      if (
        ct.startsWith("text/") ||
        ct.includes("json") ||
        ct.includes("xml") ||
        ct.includes("markdown")
      ) {
        return { content: await res.text(), contentType: ct };
      }
      // Binary content — return base64
      const buf = Buffer.from(await res.arrayBuffer());
      return { content: buf.toString("base64"), contentType: ct, encoding: "base64" };
    }

    case "upload_document": {
      // Create a multipart upload via the API
      const boundary = `----FormBoundary${Date.now()}`;
      const contentType = args.filename.endsWith(".md")
        ? "text/markdown"
        : args.filename.endsWith(".json")
          ? "application/json"
          : args.filename.endsWith(".csv")
            ? "text/csv"
            : args.filename.endsWith(".html")
              ? "text/html"
              : "text/plain";

      const bodyParts = [
        `--${boundary}\r\n`,
        `Content-Disposition: form-data; name="file"; filename="${args.filename}"\r\n`,
        `Content-Type: ${contentType}\r\n\r\n`,
        args.content,
        `\r\n--${boundary}--\r\n`,
      ];
      const body = bodyParts.join("");

      const url = `${PAPERCLIP_API_URL}/api/companies/${companyId}/doc-tree/folders/${args.folder_id}/upload`;
      const headers = {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      };
      if (PAPERCLIP_API_KEY) {
        headers["Authorization"] = `Bearer ${PAPERCLIP_API_KEY}`;
      }
      const res = await fetch(url, { method: "POST", headers, body });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Upload failed: ${res.status} ${text}`);
      }
      return res.json();
    }

    case "move_document":
      return apiRequest(
        `/companies/${companyId}/doc-tree/files/${args.file_id}`,
        "PATCH",
        { folderId: args.target_folder_id },
      );

    case "create_folder":
      return apiRequest(`/companies/${companyId}/doc-tree/folders`, "POST", {
        parentId: args.parent_id || null,
        name: args.name,
      });

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
            serverInfo: { name: "doctree-mcp", version: "1.0.0" },
          },
        });
        break;

      case "notifications/initialized":
        break;

      case "tools/list":
        send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
        break;

      case "tools/call": {
        const result = await handleToolCall(
          params.name,
          params.arguments || {},
        );
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
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
