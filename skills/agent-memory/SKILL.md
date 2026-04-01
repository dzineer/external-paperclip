---
name: agent-memory
description: >
  Your personal knowledge brain. Query your brain FIRST before external research.
  Use agent-memory MCP tools to search, store, and recall knowledge that has been
  trained specifically for you.
---

# Your Knowledge Brain

You have a **personal knowledge brain** via MCP tools (server: `agent-memory`). Your brain contains documents and knowledge that your manager has trained you on, plus anything you've stored during previous sessions.

## IMPORTANT: Always Check Your Brain First

Before searching externally or making assumptions, **query your brain**:

```
Use tool: query_brain
  query: "What do I know about [topic relevant to your task]?"
```

If your brain has the answer, use it. If not, then proceed with external research.

## Available Tools

### `query_brain` — Search your knowledge

```
Use tool: query_brain
  query: "payment processing architecture"
  max_facts: 10
```

Returns facts, entities, and relationships from your trained knowledge. Use this for:
- Factual lookups ("What is our policy on X?")
- Technical questions ("How does service Y work?")
- Finding context ("What happened in the Q4 review?")

### `remember` — Store new knowledge

```
Use tool: remember
  content: "The payment service uses Stripe Connect with platform fees of 2.9% + $0.30 per transaction."
  source: "Task #1234 - Payment Research"
```

Store important findings so you remember them in future sessions. Use this when:
- You discover something important during research
- You complete analysis worth preserving
- You learn something not in your training data

### `recall_context` — Context-aware retrieval

```
Use tool: recall_context
  messages:
    - role: "user"
      content: "What's the latest on the board meeting?"
    - role: "assistant"
      content: "Let me check my knowledge..."
```

Better than `query_brain` when you have conversation context. It uses the full conversation to infer what you need.

### `list_memories` — See what you know

```
Use tool: list_memories
  last_n: 20
```

Lists recent training episodes — what documents were ingested and when.

### `forget_all` — Reset brain (DESTRUCTIVE)

```
Use tool: forget_all
  confirm: true
```

Only use when explicitly asked to clear your knowledge. This is irreversible.

## Heartbeat Pattern

### On Wake

1. **Check your brain first** for the current task:
   ```
   query_brain(query: "[summary of your task]")
   ```
2. If brain has relevant knowledge, use it as your starting point
3. If not, proceed with external research

### On Sleep

1. **Store important findings** from this session:
   ```
   remember(
     content: "[key findings, decisions, or knowledge discovered]",
     source: "Task #XXXX - [task description]"
   )
   ```
2. Only store knowledge with lasting value — not temporary debugging notes

## What's In Your Brain

Your brain is trained on specific document folders by your manager. It contains:
- Company documents relevant to your role
- Reference materials and policies
- Knowledge extracted from previous sessions you've stored

Your brain is **private** — no other agent can access it.
