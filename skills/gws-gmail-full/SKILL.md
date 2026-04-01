---
name: gws-gmail-full
description: >
  Full Gmail access via GWS MCP. Read, draft, and send emails.
  Only assign to trusted agents with explicit send authorization.
---

# Gmail — Full Access

You have **full** access to Gmail via MCP tools (server: `gws`), including the ability to send emails.

## Available Tools

### `gmail_list_messages` — List inbox messages

```
Use tool: gmail_list_messages
  max_results: 10
  query: "is:unread"    (optional, Gmail search syntax)
```

### `gmail_get_message` — Read a specific email

```
Use tool: gmail_get_message
  message_id: "18f1a2b3c4d5e6f7"
```

### `gmail_send_message` — Send an email

```
Use tool: gmail_send_message
  to: "recipient@example.com"
  subject: "Meeting Follow-up"
  body: "Hi, ..."
  cc: "other@example.com"    (optional)
```

## Guidelines

- Always double-check recipients before sending
- Use professional tone appropriate for the CEO's communications
- For sensitive emails (legal, financial, board), draft first and confirm with the board before sending
- CC relevant stakeholders when appropriate
- Keep emails concise and action-oriented

## When to Use

- Sending follow-ups after meetings
- Responding to routine correspondence
- Distributing briefings and summaries
- Scheduling-related communications
