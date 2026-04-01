---
name: gws-tasks
description: >
  Google Tasks access via GWS MCP. List and create tasks.
  Assign to agents who manage task lists or to-do tracking.
---

# Google Tasks

You have access to Google Tasks via MCP tools (server: `gws`).

## Available Tools

### `tasks_list` — List tasks

```
Use tool: tasks_list
  max_results: 20    (optional)
```

Returns task titles, due dates, status, and notes.

### `tasks_create` — Create a new task

```
Use tool: tasks_create
  title: "Follow up on board meeting action items"
  notes: "Review and distribute minutes"    (optional)
  due: "2026-04-05T17:00:00Z"              (optional)
```

## When to Use

- Tracking action items from meetings or briefings
- Creating follow-up reminders
- Reviewing pending tasks and deadlines
