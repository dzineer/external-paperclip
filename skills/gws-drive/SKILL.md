---
name: gws-drive
description: >
  Google Drive access via GWS MCP. Browse, read, and create files.
  Assign to agents who need to work with shared Drive documents.
---

# Google Drive

You have access to Google Drive via MCP tools (server: `gws`).

## Available Tools

### `drive_list_files` — Browse Drive files

```
Use tool: drive_list_files
  query: "name contains 'report'"    (optional, Drive search syntax)
  max_results: 20                    (optional)
```

### `drive_get_file` — Get file metadata

```
Use tool: drive_get_file
  file_id: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
```

### `drive_read_file` — Read/export file content

```
Use tool: drive_read_file
  file_id: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
  mime_type: "text/plain"    (optional, export format for Google Docs)
```

### `drive_create_file` — Create a new file

```
Use tool: drive_create_file
  name: "Q1 Analysis.md"
  content: "# Q1 Analysis\n\n..."
  mime_type: "text/markdown"    (optional)
  parent_id: "folder-id"       (optional)
```

## When to Use

- Searching for existing company documents
- Reading shared reports, specs, or reference materials
- Creating new documents from research or analysis
- Importing Drive files into the document tree
