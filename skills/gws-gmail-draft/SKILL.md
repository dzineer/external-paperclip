---
name: gws-gmail-draft
description: >
  Draft-only Gmail access via GWS MCP. Read and draft emails but NEVER send.
  Assign to agents who need email awareness without send permissions.
---

# Gmail — Draft Only

You have **read and draft** access to Gmail via MCP tools (server: `gws`).

## CRITICAL RESTRICTION

**You MUST NOT use `gmail_send_message`.** You are only authorized to draft emails. If you attempt to send, the system will block it.

When you need an email sent, draft it and escalate to the CEO or board for approval and sending.

## Available Tools

### `gmail_list_messages` — List inbox messages

```
Use tool: gmail_list_messages
  max_results: 10      (optional, default 10)
  query: "from:ceo"    (optional, Gmail search syntax)
```

Returns message IDs, subjects, senders, dates, and snippets.

### `gmail_get_message` — Read a specific email

```
Use tool: gmail_get_message
  message_id: "18f1a2b3c4d5e6f7"
```

Returns full email content including body, attachments list, headers.

### `gmail_send_message` — BLOCKED

**DO NOT USE THIS TOOL.** You do not have send permissions. Draft emails by reporting the draft content in your task update instead.

## When to Use

- Checking for important emails the CEO should know about
- Summarizing inbox activity
- Drafting response suggestions (output as text, do NOT send)
- Monitoring for time-sensitive communications

## Draft Pattern

When asked to "send an email" or "reply to an email":

1. Read the original email with `gmail_get_message`
2. Compose your draft response as markdown text
3. Report the draft in your task update: "Draft email prepared for CEO approval"
4. **DO NOT call `gmail_send_message`**
