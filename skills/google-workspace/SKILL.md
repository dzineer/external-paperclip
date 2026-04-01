# Google Workspace Integration

You have access to Google Workspace tools via the `gws` MCP server. These let you interact with Drive, Gmail, Calendar, Docs, Sheets, and Tasks on behalf of the company.

## Available Tools

### Google Drive
- **drive_list_files** — Search and list files. Use the `query` parameter with Drive search syntax (e.g. `name contains 'Q1'`, `mimeType='application/vnd.google-apps.spreadsheet'`).
- **drive_get_file** — Get file metadata (name, type, size, link).
- **drive_read_file** — Read/export file content as text. Works with Docs, Sheets (CSV), and text files.
- **drive_create_file** — Create new files or Google Docs/Sheets/Slides.

### Gmail
- **gmail_list_messages** — Search inbox with Gmail query syntax (e.g. `from:alice is:unread subject:report`).
- **gmail_get_message** — Read a specific email by ID.
- **gmail_send_message** — Send an email with to, subject, body, and optional cc/bcc.

### Google Calendar
- **calendar_list_events** — List upcoming events. Use `time_min`/`time_max` (ISO 8601) to filter by date range.
- **calendar_create_event** — Create events with title, start/end times, description, and attendees.

### Google Docs
- **docs_get_document** — Read a Google Doc's full content and structure.

### Google Sheets
- **sheets_get_values** — Read cell values from a spreadsheet (A1 notation, e.g. `Sheet1!A1:D10`).
- **sheets_update_values** — Write values to a spreadsheet range.

### Google Tasks
- **tasks_list** — List tasks from a task list.
- **tasks_create** — Create a new task with title, notes, and due date.

## Guidelines

### When to use these tools
- When a task involves reading, creating, or managing company documents, emails, calendar events, or spreadsheets.
- When you need to look up information stored in Google Drive.
- When you need to send communications or schedule meetings.

### Best practices
- **Search before creating** — Always check if a file/doc already exists before creating a new one.
- **Be specific with queries** — Use Drive/Gmail search syntax for precise results instead of listing everything.
- **Confirm before sending** — Before sending emails or creating calendar events with attendees, confirm the action with the user unless explicitly instructed.
- **Don't read everything** — Only read files that are relevant to your current task.
- **Date formats** — Always use ISO 8601 format for dates and times (e.g. `2026-03-31T10:00:00-04:00`).

### What NOT to do
- Don't send emails without explicit instruction or approval.
- Don't delete files or events (deletion tools are intentionally not provided).
- Don't read emails or files unrelated to the current task.
- Don't store sensitive content from emails/docs in the knowledge graph verbatim.
