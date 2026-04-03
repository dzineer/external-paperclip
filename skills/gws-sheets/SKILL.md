---
name: gws-sheets
description: >
  Google Sheets access via GWS MCP. Read and write spreadsheet data.
  Assign to agents who need to work with structured data in Sheets.
---

# Google Sheets

You have access to Google Sheets via MCP tools (server: `gws`).

## Available Tools

### `sheets_get_values` — Read cell values

```
Use tool: sheets_get_values
  spreadsheet_id: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
  range: "Sheet1!A1:D10"
```

Returns a 2D array of cell values.

### `sheets_update_values` — Write cell values

```
Use tool: sheets_update_values
  spreadsheet_id: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
  range: "Sheet1!A1:B2"
  values: [["Name", "Score"], ["Alice", "95"]]
```

## When to Use

- Reading financial data, metrics, or tracking sheets
- Updating status columns or data entries
- Extracting structured data for analysis
- Populating reports from spreadsheet sources
