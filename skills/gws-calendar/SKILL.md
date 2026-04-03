---
name: gws-calendar
description: >
  Google Calendar access via GWS MCP. View and create calendar events.
  Assign to agents who manage schedules or need availability awareness.
---

# Google Calendar

You have access to Google Calendar via MCP tools (server: `gws`).

## Available Tools

### `calendar_list_events` — List upcoming events

```
Use tool: calendar_list_events
  time_min: "2026-04-01T00:00:00Z"    (optional, defaults to now)
  time_max: "2026-04-07T23:59:59Z"    (optional)
  max_results: 20                      (optional)
```

Returns event summaries, times, locations, attendees, and links.

### `calendar_create_event` — Create a new event

```
Use tool: calendar_create_event
  summary: "Board Review Prep"
  start_time: "2026-04-02T09:00:00-04:00"
  end_time: "2026-04-02T10:30:00-04:00"
  description: "Prepare materials for Q1 board review"    (optional)
  location: "Conference Room A"                           (optional)
  attendees: ["ceo@company.com", "cfo@company.com"]      (optional)
```

## When to Use

- Checking CEO or team availability before scheduling
- Creating events for meetings, briefings, deadlines
- Reviewing the week's schedule for planning
- Finding open time slots for focus work or meetings

## Guidelines

- Always check existing events before creating new ones to avoid conflicts
- Include relevant attendees when creating events
- Use descriptive summaries (not just "Meeting")
- Set appropriate durations — default to 30m for syncs, 60m for reviews
