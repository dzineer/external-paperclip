---
name: graphiti-memory
description: >
  Knowledge graph memory backed by Graphiti. Use this skill to store and retrieve
  long-term memory, document knowledge, entity relationships, and conversation
  context via MCP tools. Trigger on: saving facts, recalling past context,
  ingesting documents, searching for relationships between entities, or any
  operation where you need persistent memory across sessions.
---

# Graphiti Memory Skill

You have access to a **knowledge graph + vector database** via MCP tools (server: `graphiti`). This is your long-term memory. Use it to store facts, relationships, and documents that persist across sessions and heartbeats.

## When to Use This

- **Store** anything you learn that should survive this session: decisions, facts, relationships, user preferences, project context.
- **Recall** before starting work: search for relevant context about the task, project, or entities involved.
- **Ingest** documents, conversation summaries, or meeting notes for later retrieval.

## Group ID Convention

Every operation requires a `group_id` to scope data. Use these conventions:

| Scope | Pattern | Example |
|-------|---------|---------|
| Company-wide knowledge | `company-{companyId}` | `company-abc123` |
| Project-specific | `project-{projectId}` | `project-def456` |
| Agent personal memory | `agent-{agentId}` | `agent-ghi789` |
| Documentation | `docs-{collection}` | `docs-api-reference` |

Use `$PAPERCLIP_COMPANY_ID` and `$PAPERCLIP_AGENT_ID` environment variables to build group IDs dynamically.

## MCP Tools Available

All tools are on the `graphiti` MCP server.

### Storing Knowledge

#### `add_messages` -- Primary ingestion tool

Feed text into the knowledge graph. Graphiti automatically extracts entities, relationships, and facts using an LLM. This is async -- data is queued for processing.

```
Use tool: add_messages
  group_id: "project-{projectId}"
  messages:
    - content: "The auth service was migrated from JWT to OAuth2 in March. Sarah led the effort."
      name: "system"
      role_type: "system"
```

**What to ingest:**
- Decisions made during this session
- New facts learned about the project, codebase, or domain
- Summaries of completed work
- User preferences and corrections
- Meeting notes or document content

**Tips:**
- Be specific and factual in the content. "Auth uses OAuth2 since March 2025" is better than "we changed auth."
- Include names, dates, and concrete details -- these become graph nodes and edges.
- One message can contain multiple facts. Graphiti will extract them all.
- Batch related facts into a single `add_messages` call when possible.

#### `add_entity` -- Manual entity creation

Use when you want to explicitly create a named entity without relying on LLM extraction.

```
Use tool: add_entity
  group_id: "project-{projectId}"
  name: "Payment Service"
  summary: "Core microservice for payment processing. Uses Adyen gateway. Deployed on k8s cluster-east."
```

### Retrieving Knowledge

#### `search_graph` -- Fact search

Search for specific facts or relationships. Uses hybrid retrieval: keyword + semantic + graph traversal.

```
Use tool: search_graph
  query: "what does the payment service depend on?"
  group_ids: ["project-{projectId}"]
  max_facts: 10
```

**When to use:**
- Before starting a task, search for relevant context
- When you need to know relationships between entities
- When answering questions about past decisions or architecture

#### `get_memory` -- Conversation-aware retrieval

Pass recent conversation messages to get contextually relevant facts. Better than `search_graph` when you want facts relevant to an ongoing conversation rather than a specific query.

```
Use tool: get_memory
  group_id: "project-{projectId}"
  messages:
    - role_type: "user"
      content: "Can you fix the auth timeout bug?"
    - role_type: "assistant"
      content: "Let me check what auth system we're using."
  max_facts: 10
```

#### `get_episodes` -- Recent ingestion history

See what was recently ingested into a group. Useful for understanding what knowledge is available.

```
Use tool: get_episodes
  group_id: "project-{projectId}"
  last_n: 20
```

### Maintenance

#### `delete_group` -- Remove all data for a group

**Destructive.** Only use when explicitly asked to clear memory for a scope.

```
Use tool: delete_group
  group_id: "project-{projectId}"
```

## Heartbeat Memory Pattern

Follow this pattern in every heartbeat:

### On Wake (start of heartbeat)

1. **Recall context.** Before doing any work, search for relevant memory:
   ```
   search_graph(query: "<brief description of your current task>", group_ids: ["project-{id}", "company-{id}"])
   ```
2. **Use the results** to inform your work. Don't repeat solved problems or contradict past decisions.

### On Sleep (end of heartbeat)

1. **Store what you learned.** Before exiting, ingest any new facts, decisions, or context:
   ```
   add_messages(group_id: "project-{id}", messages: [{content: "<summary of what happened>", role_type: "system"}])
   ```
2. **Be selective.** Don't store routine operations. Store decisions, discoveries, errors, and their resolutions.

## What Makes Good Memory

**Store:**
- Architectural decisions and their rationale
- Bug root causes and fixes
- Entity relationships (service dependencies, team ownership, API contracts)
- User preferences and corrections
- Domain knowledge that's not obvious from code

**Don't store:**
- Raw code (it's in git)
- Temporary debugging output
- Information that changes every heartbeat
- Anything you can derive by reading the codebase

## Example: Full Session

```
# Wake up, check task
search_graph(query: "payment retry logic", group_ids: ["project-abc"])
# -> Returns: "Payment service retries failed charges 3 times with exponential backoff. Added by Sarah in Q3."

# Do the work...
# Found and fixed a bug in the retry logic

# Store what we learned
add_messages(
  group_id: "project-abc",
  messages: [{
    content: "Fixed bug in payment retry logic: the backoff multiplier was applied before the base delay, causing the first retry to happen immediately. Changed to apply base delay first. The retry sequence is now 1s, 2s, 4s as intended.",
    name: "agent",
    role_type: "system",
    timestamp: "2025-10-15T14:30:00Z"
  }]
)
```
