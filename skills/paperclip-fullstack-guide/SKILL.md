---
name: paperclip-fullstack-guide
description: >
  Complete guide for building full-stack features in Paperclip. Covers every layer:
  database schema (Drizzle + PostgreSQL), backend service + Express routes, frontend
  React page + sidebar navigation, MCP service for agent tooling, and agent skills.
  Based on the Document Tree feature as a reference implementation. Use this when
  building any new feature that touches multiple layers of the stack.
---

# Paperclip Full-Stack Feature Guide

This guide walks through building a complete feature in Paperclip, from database to agent integration. It uses the **Document Tree** feature as a reference implementation — every pattern shown here is a real, working example you can copy.

## Architecture Overview

A full Paperclip feature has up to 5 layers:

```
┌─────────────────────────────────────────────────────┐
│  Agent Skill (SKILL.md)                             │  ← Teaches agents when/how to use the feature
├─────────────────────────────────────────────────────┤
│  MCP Service (server.js)                            │  ← Bridges agent tools to REST API
├─────────────────────────────────────────────────────┤
│  Frontend (React page + sidebar)                    │  ← UI for human users
├─────────────────────────────────────────────────────┤
│  Backend (Express routes + service)                 │  ← REST API + business logic
├─────────────────────────────────────────────────────┤
│  Database (Drizzle schema + migration)              │  ← Data persistence
└─────────────────────────────────────────────────────┘
```

Not every feature needs all 5. Pick what you need:

| Scenario | Layers |
|----------|--------|
| Data feature with UI + agent access | All 5 |
| UI-only feature (no agent access) | DB + Backend + Frontend |
| Agent-only feature (no UI) | DB + Backend + MCP + Skill |
| Read-only agent tool over existing data | MCP + Skill |

---

## Layer 1: Database Schema

**Tech:** Drizzle ORM + PostgreSQL

### File Locations

```
packages/db/src/schema/         ← Table definitions (one file per table)
packages/db/src/schema/index.ts ← Export barrel (must export every table)
packages/db/src/migrations/     ← SQL migration files (sequential numbering)
```

### Creating a New Table

Create a new file in `packages/db/src/schema/`:

```typescript
// packages/db/src/schema/my_feature.ts
import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const myFeatures = pgTable(
  "my_features",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("my_features_company_idx").on(table.companyId),
  }),
);
```

### Key Conventions

- **Every table has `company_id`** — all data is company-scoped (multi-tenancy)
- **Use `uuid` primary keys** with `defaultRandom()`
- **Always include `created_at` and `updated_at`** with timezone
- **Self-references** (parent/child) use nullable `uuid` columns
- **Foreign keys** use `.references(() => otherTable.id)`
- **Junction tables** link two entities (e.g. `doc_folder_files` links `doc_folders` to `assets`)
- **Reuse `assets` table** for file storage — don't create new file tables

### Export in index.ts

```typescript
// packages/db/src/schema/index.ts — add your export
export { myFeatures } from "./my_features.js";
```

### Writing a Migration

Create `packages/db/src/migrations/NNNN_descriptive_name.sql`:

```sql
CREATE TABLE "my_features" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "my_features" ADD CONSTRAINT "my_features_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "my_features_company_idx" ON "my_features" USING btree ("company_id");
```

**Migration rules:**
- Number sequentially (check `ls packages/db/src/migrations/` for the latest)
- Use `gen_random_uuid()` for UUID defaults
- Use `timestamp with time zone` for all timestamps
- Separate statements with `--> statement-breakpoint`
- **Only add tables/columns** — never drop or alter existing tables in feature migrations

### Reference: `doc_folders` table

```
packages/db/src/schema/doc_folders.ts      — Folder hierarchy with path, ownerRole, parentId
packages/db/src/schema/doc_folder_files.ts — Links assets to folders (displayName, sourceType)
packages/db/src/migrations/0046_document_tree.sql — Migration creating both tables
```

---

## Layer 2: Backend Service + Routes

**Tech:** Express 5 + TypeScript

### File Locations

```
server/src/services/         ← Business logic (one service per domain)
server/src/services/index.ts ← Service export barrel
server/src/routes/           ← Express route handlers
server/src/app.ts            ← Route mounting
server/src/errors.ts         ← Error helpers (badRequest, notFound, forbidden)
server/src/attachment-types.ts ← File upload config
```

### Creating a Service

Services encapsulate business logic and database queries:

```typescript
// server/src/services/my-feature.ts
import { eq, and, asc } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { myFeatures } from "@paperclipai/db";

export function myFeatureService(db: Db) {
  return {
    async list(companyId: string) {
      return db
        .select()
        .from(myFeatures)
        .where(eq(myFeatures.companyId, companyId))
        .orderBy(asc(myFeatures.sortOrder));
    },

    async create(companyId: string, data: { name: string }) {
      const [row] = await db
        .insert(myFeatures)
        .values({ companyId, name: data.name })
        .returning();
      return row;
    },

    async getById(id: string) {
      return db
        .select()
        .from(myFeatures)
        .where(eq(myFeatures.id, id))
        .then((rows) => rows[0] ?? null);
    },

    async delete(companyId: string, id: string) {
      await db
        .delete(myFeatures)
        .where(and(eq(myFeatures.id, id), eq(myFeatures.companyId, companyId)));
      return { deleted: true };
    },
  };
}
```

### Export in services/index.ts

```typescript
export { myFeatureService } from "./my-feature.js";
```

### Creating Routes

Routes handle HTTP, auth, validation, and delegate to services:

```typescript
// server/src/routes/my-feature.ts
import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { myFeatureService } from "../services/my-feature.js";
import { logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { badRequest, notFound } from "../errors.js";

export function myFeatureRoutes(db: Db) {
  const router = Router();
  const svc = myFeatureService(db);

  // List all
  router.get("/companies/:companyId/my-features", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);   // Always check access first

    const items = await svc.list(companyId);
    res.json(items);
  });

  // Create
  router.post("/companies/:companyId/my-features", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const { name } = req.body;
    if (!name || typeof name !== "string") throw badRequest("name is required");

    const item = await svc.create(companyId, { name });

    // Log activity for audit trail
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "my_feature.created",
      entityType: "my_feature",
      entityId: item.id,
      details: { name: item.name },
    });

    res.status(201).json(item);
  });

  // Delete
  router.delete("/companies/:companyId/my-features/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);

    const result = await svc.delete(companyId, id);
    res.json(result);
  });

  return router;
}
```

### Route Conventions

| Method | Pattern | Purpose |
|--------|---------|---------|
| `GET` | `/companies/:companyId/things` | List all |
| `POST` | `/companies/:companyId/things` | Create |
| `GET` | `/companies/:companyId/things/:id` | Get one |
| `PATCH` | `/companies/:companyId/things/:id` | Update |
| `DELETE` | `/companies/:companyId/things/:id` | Delete |

### Auth & Actor Pattern

```typescript
import { assertCompanyAccess, getActorInfo } from "./authz.js";

// Always call assertCompanyAccess first — it checks:
// - Board users: must be member of the company
// - Agents: must belong to the company
// - Local implicit: always allowed
assertCompanyAccess(req, companyId);

// getActorInfo returns the actor identity for logging:
const actor = getActorInfo(req);
// actor.actorType: "user" | "agent"
// actor.actorId: userId or agentId
// actor.agentId: agentId or null
// actor.runId: heartbeat run ID or null
```

### File Upload Pattern

```typescript
import multer from "multer";
import type { StorageService } from "../storage/types.js";
import { isAllowedContentType, MAX_ATTACHMENT_BYTES } from "../attachment-types.js";

export function myFeatureRoutes(db: Db, storage: StorageService) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
  });

  router.post("/companies/:companyId/my-features/:id/upload", async (req, res) => {
    assertCompanyAccess(req, companyId);

    // Parse multipart upload
    await new Promise<void>((resolve, reject) => {
      upload.single("file")(req, res, (err: unknown) => {
        if (err) reject(err); else resolve();
      });
    });

    const file = (req as any).file;
    if (!file) throw badRequest("Missing file");

    const contentType = (file.mimetype || "").toLowerCase();
    if (!isAllowedContentType(contentType)) {
      res.status(422).json({ error: `Unsupported type: ${contentType}` });
      return;
    }

    // Store via storage service (local disk or S3)
    const stored = await storage.putFile({
      companyId,
      namespace: "assets/my-feature",
      originalFilename: file.originalname || null,
      contentType,
      body: file.buffer,
    });

    // Create asset record in DB
    const asset = await assetSvc.create(companyId, { ...stored });

    res.status(201).json({ assetId: asset.id, contentPath: `/api/assets/${asset.id}/content` });
  });
}
```

### Mounting Routes in app.ts

```typescript
// server/src/app.ts — add import
import { myFeatureRoutes } from "./routes/my-feature.js";

// In createApp() — add to the api router
api.use(myFeatureRoutes(db));
// Or if your routes need storage:
api.use(myFeatureRoutes(db, opts.storageService));
```

### Reference: Document Tree backend

```
server/src/services/doc-tree.ts — Service with seedDefaultFolders, listTree, CRUD
server/src/routes/doc-tree.ts   — 9 endpoints including file upload + Google Drive import
```

---

## Layer 3: Frontend — Page + Sidebar

**Tech:** React 19 + Vite + Tailwind + shadcn/ui + TanStack Query

### File Locations

```
ui/src/pages/           ← Page components (one per route)
ui/src/components/      ← Shared components
ui/src/api/             ← API client modules
ui/src/lib/queryKeys.ts ← React Query cache keys
ui/src/App.tsx          ← Route definitions
ui/src/components/Sidebar.tsx ← Navigation sidebar
```

### Step 1: API Client

```typescript
// ui/src/api/my-feature.ts
import { api } from "./client";

export interface MyFeature {
  id: string;
  companyId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export const myFeatureApi = {
  list: (companyId: string) =>
    api.get<MyFeature[]>(`/companies/${companyId}/my-features`),

  create: (companyId: string, name: string) =>
    api.post<MyFeature>(`/companies/${companyId}/my-features`, { name }),

  delete: (companyId: string, id: string) =>
    api.delete<{ deleted: boolean }>(`/companies/${companyId}/my-features/${id}`),

  // For file uploads:
  upload: async (companyId: string, id: string, file: File) => {
    const buffer = await file.arrayBuffer();
    const safeFile = new File([buffer], file.name, { type: file.type });
    const form = new FormData();
    form.append("file", safeFile);
    return api.postForm<{ assetId: string }>(`/companies/${companyId}/my-features/${id}/upload`, form);
  },
};
```

**API client methods:**
- `api.get<T>(path)` — GET request
- `api.post<T>(path, body)` — POST with JSON body
- `api.patch<T>(path, body)` — PATCH with JSON body
- `api.delete<T>(path)` — DELETE request
- `api.postForm<T>(path, formData)` — POST with multipart/form-data (for file uploads)

### Step 2: Query Keys

```typescript
// ui/src/lib/queryKeys.ts — add your key
export const queryKeys = {
  // ... existing keys ...
  myFeature: (companyId: string) => ["my-feature", companyId] as const,
};
```

### Step 3: Page Component

```typescript
// ui/src/pages/MyFeature.tsx
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Boxes } from "lucide-react";    // Pick an icon from lucide-react
import { myFeatureApi } from "../api/my-feature";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";

export function MyFeature() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  // 1. Set breadcrumb
  useEffect(() => {
    setBreadcrumbs([{ label: "My Feature" }]);
  }, [setBreadcrumbs]);

  // 2. Fetch data
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.myFeature(selectedCompanyId!),
    queryFn: () => myFeatureApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // 3. Mutations
  const createMutation = useMutation({
    mutationFn: (name: string) => myFeatureApi.create(selectedCompanyId!, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.myFeature(selectedCompanyId!) }),
  });

  // 4. Guard: no company selected
  if (!selectedCompanyId) {
    return <EmptyState icon={Boxes} message="Select a company." />;
  }

  // 5. Loading state
  if (isLoading) return <PageSkeleton variant="list" />;

  // 6. Render
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">My Feature</h2>
        <Button size="sm" onClick={() => createMutation.mutate("New Item")}>
          Add Item
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {data && data.length === 0 && (
        <EmptyState icon={Boxes} message="No items yet." />
      )}

      {data && data.length > 0 && (
        <div className="border border-border rounded-lg divide-y divide-border">
          {data.map((item) => (
            <div key={item.id} className="px-4 py-3 text-sm">
              {item.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Page Pattern Checklist

1. Get `selectedCompanyId` from `useCompany()` context
2. Set breadcrumbs on mount via `useBreadcrumbs()`
3. Use `useQuery` with `enabled: !!selectedCompanyId`
4. Use `useMutation` + `queryClient.invalidateQueries` for writes
5. Show `EmptyState` when no company / no data
6. Show `PageSkeleton` while loading
7. Use shadcn/ui components (`Button`, `Input`, `Dialog`, etc.)

### Step 4: Add Sidebar Nav Item

```typescript
// ui/src/components/Sidebar.tsx

// 1. Import the icon
import { Boxes } from "lucide-react";  // or FolderTree, FileText, etc.

// 2. Add nav item in the correct section
// Company section (alongside Org, Skills, Costs, Activity, Settings):
<SidebarNavItem to="/my-feature" label="My Feature" icon={Boxes} />
```

**Sidebar sections and where to add:**

| Section | Contains | Add your feature here if... |
|---------|----------|---------------------------|
| Top (Quick) | Dashboard, Inbox | Core navigation only |
| Work | Issues, Routines, Goals | Work tracking features |
| Projects | Dynamic project list | Project-specific features |
| Agents | Dynamic agent list | Agent-specific features |
| Company | Org, Skills, Costs, Activity, Settings, **Documents** | Company-wide features |

### Step 5: Add Route

```typescript
// ui/src/App.tsx

// 1. Import the page
import { MyFeature } from "./pages/MyFeature";

// 2. Add inside boardRoutes() (these are under /:companyPrefix)
<Route path="my-feature" element={<MyFeature />} />

// 3. IMPORTANT: Add unprefixed redirect (near line 324+, before :companyPrefix catch-all)
<Route path="my-feature" element={<UnprefixedBoardRedirect />} />
```

**Why both routes?** The sidebar links to `/my-feature` (no company prefix). The `UnprefixedBoardRedirect` catches this and redirects to `/{companyPrefix}/my-feature`. Inside `boardRoutes()`, the route renders the actual page.

**This is a common gotcha.** If you skip the `UnprefixedBoardRedirect`, clicking the sidebar link will treat your route name as a company prefix and show "Company not found".

### Reference: Document Tree frontend

```
ui/src/api/doc-tree.ts          — API client with upload + Drive import
ui/src/pages/Documents.tsx      — Full page with tree view, dialogs, file icons
ui/src/lib/queryKeys.ts         — docTree key
```

---

## Layer 4: MCP Service (Agent Tooling)

**Tech:** Node.js, stdio JSON-RPC 2.0

MCP services let Claude agents use your feature via tools. They bridge MCP protocol to your REST API.

### File Location

```
/home/dev/<feature>-mcp/server.js   ← MCP server script
```

### Template

```javascript
#!/usr/bin/env node

const readline = require("readline");

const PAPERCLIP_API_URL = process.env.PAPERCLIP_API_URL || "http://localhost:3100";
const PAPERCLIP_API_KEY = process.env.PAPERCLIP_API_KEY || "";
const PAPERCLIP_COMPANY_ID = process.env.PAPERCLIP_COMPANY_ID || "";

// 1. HTTP client for Paperclip API
async function apiRequest(path, method = "GET", body = null) {
  const url = `${PAPERCLIP_API_URL}/api${path}`;
  const options = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (PAPERCLIP_API_KEY) {
    options.headers["Authorization"] = `Bearer ${PAPERCLIP_API_KEY}`;
  }
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

// 2. Define tools with JSON Schema input definitions
const TOOLS = [
  {
    name: "list_items",
    description: "List all items for the current company.",
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "Company ID (optional, uses env default)" },
      },
    },
  },
  {
    name: "create_item",
    description: "Create a new item.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Item name" },
        company_id: { type: "string" },
      },
      required: ["name"],
    },
  },
];

// 3. Map tool calls to API requests
async function handleToolCall(name, args) {
  const companyId = args.company_id || PAPERCLIP_COMPANY_ID;

  switch (name) {
    case "list_items":
      return apiRequest(`/companies/${companyId}/my-features`);
    case "create_item":
      return apiRequest(`/companies/${companyId}/my-features`, "POST", { name: args.name });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// 4. MCP stdio transport (copy this exactly)
const rl = readline.createInterface({ input: process.stdin });

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

rl.on("line", async (line) => {
  let request;
  try { request = JSON.parse(line); } catch { return; }

  const { id, method, params } = request;

  try {
    switch (method) {
      case "initialize":
        send({
          jsonrpc: "2.0", id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "my-feature-mcp", version: "1.0.0" },
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
          jsonrpc: "2.0", id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        });
        break;
      }

      default:
        send({
          jsonrpc: "2.0", id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
    }
  } catch (err) {
    send({ jsonrpc: "2.0", id, error: { code: -32000, message: err.message } });
  }
});
```

### MCP Design Guidelines

- **One tool per action** — `list_items`, `create_item`, `delete_item` (not one tool with an `action` param)
- **company_id is always optional** — default to `PAPERCLIP_COMPANY_ID` env var
- **Return JSON** — agents parse structured data better than prose
- **Input schemas use JSON Schema** — `type`, `properties`, `required`
- **The stdio transport block is boilerplate** — copy it exactly, only change `serverInfo.name`

### Registering the MCP Server

```json
// /home/dev/paperclip-claude-config/settings.json
{
  "mcpServers": {
    "my-feature": {
      "command": "node",
      "args": ["/opt/my-feature-mcp/server.js"],
      "env": {
        "PAPERCLIP_API_URL": "http://localhost:3100"
      }
    }
  }
}
```

### Docker Mount

```yaml
# docker-compose.yml — under server.volumes
- /home/dev/my-feature-mcp:/opt/my-feature-mcp:ro
```

### Reference: Document Tree MCP

```
/home/dev/doctree-mcp/server.js — 6 tools: list, search, read, upload, move, create_folder
```

### Reference: Graphiti MCP

```
/home/dev/graphiti-mcp/server.js — 6 tools: search_graph, get_memory, add_messages, etc.
```

---

## Layer 5: Agent Skill

**Tech:** Markdown (SKILL.md)

Skills teach agents **when** and **how** to use your MCP tools. They are documentation, not code.

### File Location

```
skills/<feature-name>/SKILL.md
```

### Template

```markdown
---
name: my-feature
description: >
  Brief description of what this skill enables. Mention the MCP server name
  and key actions. This description is used for skill discovery.
---

# My Feature Skill

You have access to **My Feature** via MCP tools (server: `my-feature`).

## When to Use

- **List** items when you need to check what exists
- **Create** items when your work produces output worth saving
- **Delete** items when asked to clean up

## MCP Tools Available

### `list_items` -- Browse all items

\```
Use tool: list_items
  company_id: "$PAPERCLIP_COMPANY_ID"   (optional)
\```

### `create_item` -- Create a new item

\```
Use tool: create_item
  name: "My new item"
\```

## Heartbeat Pattern

### On Wake
1. Check existing items relevant to your task
2. Use results to avoid duplicating work

### On Sleep
1. Save any outputs worth persisting
2. Be selective — only save items with lasting value
```

### Skill Design Guidelines

- **Start with "When to Use"** — agents need to know when to activate the skill
- **Show every tool with an example** — agents learn from examples, not descriptions
- **Include a Heartbeat Pattern** — agents follow wake/sleep cycles
- **Reference `$PAPERCLIP_COMPANY_ID`** — agents have this env var at runtime
- **Keep it under 200 lines** — agents have limited context

### Docker Mount

```yaml
# docker-compose.yml — under server.volumes
- /tmp/external-paperclip/skills/my-feature:/app/skills/my-feature:ro
```

### Reference: Document Tree skill

```
skills/document-tree/SKILL.md — Filing guidelines, 6 MCP tools, heartbeat pattern
```

### Reference: Graphiti Memory skill

```
skills/graphiti-memory/SKILL.md — Knowledge graph operations, group ID conventions
```

---

## Deployment Checklist

After building all layers, deploy with these steps:

### 1. Rebuild the container

```bash
cd /tmp/external-paperclip
BETTER_AUTH_SECRET=<secret> OPENAI_API_KEY=<key> PAPERCLIP_PUBLIC_URL=<url> \
  docker-compose up -d --build server
```

### 2. Handle the ContainerConfig bug

docker-compose v1.29.2 has a known bug when recreating containers. If you see `KeyError: 'ContainerConfig'`:

```bash
# Find and remove the ghost container
docker ps -a --filter "name=server" --format "{{.ID}} {{.Names}} {{.Status}}"
docker rm -f <container_id>

# Start fresh
docker-compose up -d server
```

### 3. Verify

```bash
# Check server logs (migration should apply automatically)
docker logs external-paperclip_server_1 --tail 20

# Health check
curl http://localhost:3100/api/health

# Test your API
curl http://localhost:3100/api/companies/<companyId>/my-features
```

### 4. Enable the skill

Go to **Skills** in the Paperclip sidebar and look for your skill, or scan via API:
```
POST /api/companies/{companyId}/company-skills/scan-projects
```

---

## Existing Code to Reuse

Before building, check if these existing components/utilities solve part of your problem:

| Component | Location | What it does |
|-----------|----------|-------------|
| `PackageFileTree` | `ui/src/components/PackageFileTree.tsx` | Tree view with expand/collapse, checkboxes |
| `EmptyState` | `ui/src/components/EmptyState.tsx` | Empty state with icon + message |
| `PageSkeleton` | `ui/src/components/PageSkeleton.tsx` | Loading skeleton |
| `MarkdownBody` | `ui/src/components/MarkdownBody.tsx` | Render markdown content |
| `CommentThread` | `ui/src/components/CommentThread.tsx` | Threaded comments |
| `assets` table | `packages/db/src/schema/assets.ts` | File storage (reuse, don't reinvent) |
| `StorageService` | `server/src/storage/service.ts` | S3/local disk file storage |
| `logActivity` | `server/src/services/activity-log.ts` | Audit trail logging |
| `assertCompanyAccess` | `server/src/routes/authz.ts` | Auth guard |
| `isAllowedContentType` | `server/src/attachment-types.ts` | File type validation |

---

## Quick Reference: File Locations Summary

```
Feature: "my-feature"

packages/db/src/schema/my_feature.ts              ← DB table definition
packages/db/src/schema/index.ts                    ← Add export
packages/db/src/migrations/NNNN_my_feature.sql     ← Migration

server/src/services/my-feature.ts                  ← Business logic
server/src/services/index.ts                       ← Add export
server/src/routes/my-feature.ts                    ← Express routes
server/src/app.ts                                  ← Mount routes

ui/src/api/my-feature.ts                           ← API client
ui/src/lib/queryKeys.ts                            ← Add query key
ui/src/pages/MyFeature.tsx                         ← Page component
ui/src/components/Sidebar.tsx                      ← Add nav item
ui/src/App.tsx                                     ← Add route + UnprefixedBoardRedirect

/home/dev/my-feature-mcp/server.js                 ← MCP server
/home/dev/paperclip-claude-config/settings.json     ← Register MCP
skills/my-feature/SKILL.md                          ← Agent skill
docker-compose.yml                                  ← Volume mounts
```
