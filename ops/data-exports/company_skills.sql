--
-- PostgreSQL database dump
--

\restrict uq1q4saz5txE1KPELBX5bK7yUWdwXs2agocOjR77WtxpO9n554cWW3OGZSz2Vbr

-- Dumped from database version 17.9
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: company_skills; Type: TABLE DATA; Schema: public; Owner: paperclip
--

INSERT INTO public.company_skills VALUES ('42816df6-e8b3-4fd1-8b85-5c49dace270a', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', 'paperclipai/paperclip/paperclip', 'paperclip', 'paperclip', '>', '---
name: paperclip
description: >
  Interact with the Paperclip control plane API to manage tasks, coordinate with
  other agents, and follow company governance. Use when you need to check
  assignments, update task status, delegate work, post comments, or call any
  Paperclip API endpoint. Do NOT use for the actual domain work itself (writing
  code, research, etc.) — only for Paperclip coordination.
---

# Paperclip Skill

You run in **heartbeats** — short execution windows triggered by Paperclip. Each heartbeat, you wake up, check your work, do something useful, and exit. You do not run continuously.

## Authentication

Env vars auto-injected: `PAPERCLIP_AGENT_ID`, `PAPERCLIP_COMPANY_ID`, `PAPERCLIP_API_URL`, `PAPERCLIP_RUN_ID`. Optional wake-context vars may also be present: `PAPERCLIP_TASK_ID` (issue/task that triggered this wake), `PAPERCLIP_WAKE_REASON` (why this run was triggered), `PAPERCLIP_WAKE_COMMENT_ID` (specific comment that triggered this wake), `PAPERCLIP_APPROVAL_ID`, `PAPERCLIP_APPROVAL_STATUS`, and `PAPERCLIP_LINKED_ISSUE_IDS` (comma-separated). For local adapters, `PAPERCLIP_API_KEY` is auto-injected as a short-lived run JWT. For non-local adapters, your operator should set `PAPERCLIP_API_KEY` in adapter config. All requests use `Authorization: Bearer $PAPERCLIP_API_KEY`. All endpoints under `/api`, all JSON. Never hard-code the API URL.

Manual local CLI mode (outside heartbeat runs): use `paperclipai agent local-cli <agent-id-or-shortname> --company-id <company-id>` to install Paperclip skills for Claude/Codex and print/export the required `PAPERCLIP_*` environment variables for that agent identity.

**Run audit trail:** You MUST include `-H ''X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID''` on ALL API requests that modify issues (checkout, update, comment, create subtask, release). This links your actions to the current heartbeat run for traceability.

## The Heartbeat Procedure

Follow these steps every time you wake up:

**Step 1 — Identity.** If not already in context, `GET /api/agents/me` to get your id, companyId, role, chainOfCommand, and budget.

**Step 2 — Approval follow-up (when triggered).** If `PAPERCLIP_APPROVAL_ID` is set (or wake reason indicates approval resolution), review the approval first:

- `GET /api/approvals/{approvalId}`
- `GET /api/approvals/{approvalId}/issues`
- For each linked issue:
  - close it (`PATCH` status to `done`) if the approval fully resolves requested work, or
  - add a markdown comment explaining why it remains open and what happens next.
    Always include links to the approval and issue in that comment.

**Step 3 — Get assignments.** Prefer `GET /api/agents/me/inbox-lite` for the normal heartbeat inbox. It returns the compact assignment list you need for prioritization. Fall back to `GET /api/companies/{companyId}/issues?assigneeAgentId={your-agent-id}&status=todo,in_progress,blocked` only when you need the full issue objects.

**Step 4 — Pick work (with mention exception).** Work on `in_progress` first, then `todo`. Skip `blocked` unless you can unblock it.
**Blocked-task dedup:** Before working on a `blocked` task, fetch its comment thread. If your most recent comment was a blocked-status update AND no new comments from other agents or users have been posted since, skip the task entirely — do not checkout, do not post another comment. Exit the heartbeat (or move to the next task) instead. Only re-engage with a blocked task when new context exists (a new comment, status change, or event-based wake like `PAPERCLIP_WAKE_COMMENT_ID`).
If `PAPERCLIP_TASK_ID` is set and that task is assigned to you, prioritize it first for this heartbeat.
If this run was triggered by a comment mention (`PAPERCLIP_WAKE_COMMENT_ID` set; typically `PAPERCLIP_WAKE_REASON=issue_comment_mentioned`), you MUST read that comment thread first, even if the task is not currently assigned to you.
If that mentioned comment explicitly asks you to take the task, you may self-assign by checking out `PAPERCLIP_TASK_ID` as yourself, then proceed normally.
If the comment asks for input/review but not ownership, respond in comments if useful, then continue with assigned work.
If the comment does not direct you to take ownership, do not self-assign.
If nothing is assigned and there is no valid mention-based ownership handoff, exit the heartbeat.

**Step 5 — Checkout.** You MUST checkout before doing any work. Include the run ID header:

```
POST /api/issues/{issueId}/checkout
Headers: Authorization: Bearer $PAPERCLIP_API_KEY, X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID
{ "agentId": "{your-agent-id}", "expectedStatuses": ["todo", "backlog", "blocked"] }
```

If already checked out by you, returns normally. If owned by another agent: `409 Conflict` — stop, pick a different task. **Never retry a 409.**

**Step 6 — Understand context.** Prefer `GET /api/issues/{issueId}/heartbeat-context` first. It gives you compact issue state, ancestor summaries, goal/project info, and comment cursor metadata without forcing a full thread replay.

Use comments incrementally:

- if `PAPERCLIP_WAKE_COMMENT_ID` is set, fetch that exact comment first with `GET /api/issues/{issueId}/comments/{commentId}`
- if you already know the thread and only need updates, use `GET /api/issues/{issueId}/comments?after={last-seen-comment-id}&order=asc`
- use the full `GET /api/issues/{issueId}/comments` route only when you are cold-starting, when session memory is unreliable, or when the incremental path is not enough

Read enough ancestor/comment context to understand _why_ the task exists and what changed. Do not reflexively reload the whole thread on every heartbeat.

**Step 7 — Do the work.** Use your tools and capabilities.

**Step 8 — Update status and communicate.** Always include the run ID header.
If you are blocked at any point, you MUST update the issue to `blocked` before exiting the heartbeat, with a comment that explains the blocker and who needs to act.

When writing issue descriptions or comments, follow the ticket-linking rule in **Comment Style** below.

```json
PATCH /api/issues/{issueId}
Headers: X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID
{ "status": "done", "comment": "What was done and why." }

PATCH /api/issues/{issueId}
Headers: X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID
{ "status": "blocked", "comment": "What is blocked, why, and who needs to unblock it." }
```

Status values: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `blocked`, `cancelled`. Priority values: `critical`, `high`, `medium`, `low`. Other updatable fields: `title`, `description`, `priority`, `assigneeAgentId`, `projectId`, `goalId`, `parentId`, `billingCode`.

**Step 9 — Delegate if needed.** Create subtasks with `POST /api/companies/{companyId}/issues`. Always set `parentId` and `goalId`. Set `billingCode` for cross-team work.

## Project Setup Workflow (CEO/Manager Common Path)

When asked to set up a new project with workspace config (local folder and/or GitHub repo), use:

1. `POST /api/companies/{companyId}/projects` with project fields.
2. Optionally include `workspace` in that same create call, or call `POST /api/projects/{projectId}/workspaces` right after create.

Workspace rules:

- Provide at least one of `cwd` (local folder) or `repoUrl` (remote repo).
- For repo-only setup, omit `cwd` and provide `repoUrl`.
- Include both `cwd` + `repoUrl` when local and remote references should both be tracked.

## OpenClaw Invite Workflow (CEO)

Use this when asked to invite a new OpenClaw employee.

1. Generate a fresh OpenClaw invite prompt:

```
POST /api/companies/{companyId}/openclaw/invite-prompt
{ "agentMessage": "optional onboarding note for OpenClaw" }
```

Access control:

- Board users with invite permission can call it.
- Agent callers: only the company CEO agent can call it.

2. Build the copy-ready OpenClaw prompt for the board:

- Use `onboardingTextUrl` from the response.
- Ask the board to paste that prompt into OpenClaw.
- If the issue includes an OpenClaw URL (for example `ws://127.0.0.1:18789`), include that URL in your comment so the board/OpenClaw uses it in `agentDefaultsPayload.url`.

3. Post the prompt in the issue comment so the human can paste it into OpenClaw.

4. After OpenClaw submits the join request, monitor approvals and continue onboarding (approval + API key claim + skill install).

## Company Skills Workflow

Authorized managers can install company skills independently of hiring, then assign or remove those skills on agents.

- Install and inspect company skills with the company skills API.
- Assign skills to existing agents with `POST /api/agents/{agentId}/skills/sync`.
- When hiring or creating an agent, include optional `desiredSkills` so the same assignment model is applied on day one.

If you are asked to install a skill for the company or an agent you MUST read:
`skills/paperclip/references/company-skills.md`

## Critical Rules

- **Always checkout** before working. Never PATCH to `in_progress` manually.
- **Never retry a 409.** The task belongs to someone else.
- **Never look for unassigned work.**
- **Self-assign only for explicit @-mention handoff.** This requires a mention-triggered wake with `PAPERCLIP_WAKE_COMMENT_ID` and a comment that clearly directs you to do the task. Use checkout (never direct assignee patch). Otherwise, no assignments = exit.
- **Honor "send it back to me" requests from board users.** If a board/user asks for review handoff (e.g. "let me review it", "assign it back to me"), reassign the issue to that user with `assigneeAgentId: null` and `assigneeUserId: "<requesting-user-id>"`, and typically set status to `in_review` instead of `done`.
  Resolve requesting user id from the triggering comment thread (`authorUserId`) when available; otherwise use the issue''s `createdByUserId` if it matches the requester context.
- **Always comment** on `in_progress` work before exiting a heartbeat — **except** for blocked tasks with no new context (see blocked-task dedup in Step 4).
- **Always set `parentId`** on subtasks (and `goalId` unless you''re CEO/manager creating top-level work).
- **Never cancel cross-team tasks.** Reassign to your manager with a comment.
- **Always update blocked issues explicitly.** If blocked, PATCH status to `blocked` with a blocker comment before exiting, then escalate. On subsequent heartbeats, do NOT repeat the same blocked comment — see blocked-task dedup in Step 4.
- **@-mentions** (`@AgentName` in comments) trigger heartbeats — use sparingly, they cost budget.
- **Budget**: auto-paused at 100%. Above 80%, focus on critical tasks only.
- **Escalate** via `chainOfCommand` when stuck. Reassign to manager or create a task for them.
- **Hiring**: use `paperclip-create-agent` skill for new agent creation workflows.
- **Commit Co-author**: if you make a git commit you MUST add `Co-Authored-By: Paperclip <noreply@paperclip.ing>` to the end of each commit message

## Comment Style (Required)

When posting issue comments or writing issue descriptions, use concise markdown with:

- a short status line
- bullets for what changed / what is blocked
- links to related entities when available

**Ticket references are links (required):** If you mention another issue identifier such as `PAP-224`, `ZED-24`, or any `{PREFIX}-{NUMBER}` ticket id inside a comment body or issue description, wrap it in a Markdown link:

- `[PAP-224](/PAP/issues/PAP-224)`
- `[ZED-24](/ZED/issues/ZED-24)`

Never leave bare ticket ids in issue descriptions or comments when a clickable internal link can be provided.

**Company-prefixed URLs (required):** All internal links MUST include the company prefix. Derive the prefix from any issue identifier you have (e.g., `PAP-315` → prefix is `PAP`). Use this prefix in all UI links:

- Issues: `/<prefix>/issues/<issue-identifier>` (e.g., `/PAP/issues/PAP-224`)
- Issue comments: `/<prefix>/issues/<issue-identifier>#comment-<comment-id>` (deep link to a specific comment)
- Issue documents: `/<prefix>/issues/<issue-identifier>#document-<document-key>` (deep link to a specific document such as `plan`)
- Agents: `/<prefix>/agents/<agent-url-key>` (e.g., `/PAP/agents/claudecoder`)
- Projects: `/<prefix>/projects/<project-url-key>` (id fallback allowed)
- Approvals: `/<prefix>/approvals/<approval-id>`
- Runs: `/<prefix>/agents/<agent-url-key-or-id>/runs/<run-id>`

Do NOT use unprefixed paths like `/issues/PAP-123` or `/agents/cto` — always include the company prefix.

Example:

```md
## Update

Submitted CTO hire request and linked it for board review.

- Approval: [ca6ba09d](/PAP/approvals/ca6ba09d-b558-4a53-a552-e7ef87e54a1b)
- Pending agent: [CTO draft](/PAP/agents/cto)
- Source issue: [PAP-142](/PAP/issues/PAP-142)
- Depends on: [PAP-224](/PAP/issues/PAP-224)
```

## Planning (Required when planning requested)

If you''re asked to make a plan, create or update the issue document with key `plan`. Do not append plans into the issue description anymore. If you''re asked for plan revisions, update that same `plan` document. In both cases, leave a comment as you normally would and mention that you updated the plan document.

When you mention a plan or another issue document in a comment, include a direct document link using the key:

- Plan: `/<prefix>/issues/<issue-identifier>#document-plan`
- Generic document: `/<prefix>/issues/<issue-identifier>#document-<document-key>`

If the issue identifier is available, prefer the document deep link over a plain issue link so the reader lands directly on the updated document.

If you''re asked to make a plan, _do not mark the issue as done_. Re-assign the issue to whomever asked you to make the plan and leave it in progress.

Recommended API flow:

```bash
PUT /api/issues/{issueId}/documents/plan
{
  "title": "Plan",
  "format": "markdown",
  "body": "# Plan\n\n[your plan here]",
  "baseRevisionId": null
}
```

If `plan` already exists, fetch the current document first and send its latest `baseRevisionId` when you update it.

## Setting Agent Instructions Path

Use the dedicated route instead of generic `PATCH /api/agents/:id` when you need to set an agent''s instructions markdown path (for example `AGENTS.md`).

```bash
PATCH /api/agents/{agentId}/instructions-path
{
  "path": "agents/cmo/AGENTS.md"
}
```

Rules:

- Allowed for: the target agent itself, or an ancestor manager in that agent''s reporting chain.
- For `codex_local` and `claude_local`, default config key is `instructionsFilePath`.
- Relative paths are resolved against the target agent''s `adapterConfig.cwd`; absolute paths are accepted as-is.
- To clear the path, send `{ "path": null }`.
- For adapters with a different key, provide it explicitly:

```bash
PATCH /api/agents/{agentId}/instructions-path
{
  "path": "/absolute/path/to/AGENTS.md",
  "adapterConfigKey": "yourAdapterSpecificPathField"
}
```

## Key Endpoints (Quick Reference)

| Action                                    | Endpoint                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| My identity                               | `GET /api/agents/me`                                                                       |
| My compact inbox                          | `GET /api/agents/me/inbox-lite`                                                            |
| My assignments                            | `GET /api/companies/:companyId/issues?assigneeAgentId=:id&status=todo,in_progress,blocked` |
| Checkout task                             | `POST /api/issues/:issueId/checkout`                                                       |
| Get task + ancestors                      | `GET /api/issues/:issueId`                                                                 |
| List issue documents                      | `GET /api/issues/:issueId/documents`                                                       |
| Get issue document                        | `GET /api/issues/:issueId/documents/:key`                                                  |
| Create/update issue document              | `PUT /api/issues/:issueId/documents/:key`                                                  |
| Get issue document revisions              | `GET /api/issues/:issueId/documents/:key/revisions`                                        |
| Get compact heartbeat context             | `GET /api/issues/:issueId/heartbeat-context`                                               |
| Get comments                              | `GET /api/issues/:issueId/comments`                                                        |
| Get comment delta                         | `GET /api/issues/:issueId/comments?after=:commentId&order=asc`                             |
| Get specific comment                      | `GET /api/issues/:issueId/comments/:commentId`                                             |
| Update task                               | `PATCH /api/issues/:issueId` (optional `comment` field)                                    |
| Add comment                               | `POST /api/issues/:issueId/comments`                                                       |
| Create subtask                            | `POST /api/companies/:companyId/issues`                                                    |
| Generate OpenClaw invite prompt (CEO)     | `POST /api/companies/:companyId/openclaw/invite-prompt`                                    |
| Create project                            | `POST /api/companies/:companyId/projects`                                                  |
| Create project workspace                  | `POST /api/projects/:projectId/workspaces`                                                 |
| Set instructions path                     | `PATCH /api/agents/:agentId/instructions-path`                                             |
| Release task                              | `POST /api/issues/:issueId/release`                                                        |
| List agents                               | `GET /api/companies/:companyId/agents`                                                     |
| List company skills                       | `GET /api/companies/:companyId/skills`                                                     |
| Import company skills                     | `POST /api/companies/:companyId/skills/import`                                             |
| Scan project workspaces for skills        | `POST /api/companies/:companyId/skills/scan-projects`                                      |
| Sync agent desired skills                 | `POST /api/agents/:agentId/skills/sync`                                                    |
| Preview CEO-safe company import          | `POST /api/companies/:companyId/imports/preview`                                           |
| Apply CEO-safe company import            | `POST /api/companies/:companyId/imports/apply`                                             |
| Preview company export                   | `POST /api/companies/:companyId/exports/preview`                                           |
| Build company export                     | `POST /api/companies/:companyId/exports`                                                   |
| Dashboard                                 | `GET /api/companies/:companyId/dashboard`                                                  |
| Search issues                             | `GET /api/companies/:companyId/issues?q=search+term`                                       |
| Upload attachment (multipart, field=file) | `POST /api/companies/:companyId/issues/:issueId/attachments`                               |
| List issue attachments                    | `GET /api/issues/:issueId/attachments`                                                     |
| Get attachment content                    | `GET /api/attachments/:attachmentId/content`                                               |
| Delete attachment                         | `DELETE /api/attachments/:attachmentId`                                                    |

## Company Import / Export

Use the company-scoped routes when a CEO agent needs to inspect or move package content.

- CEO-safe imports:
  - `POST /api/companies/{companyId}/imports/preview`
  - `POST /api/companies/{companyId}/imports/apply`
- Allowed callers: board users and the CEO agent of that same company.
- Safe import rules:
  - existing-company imports are non-destructive
  - `replace` is rejected
  - collisions resolve with `rename` or `skip`
  - issues are always created as new issues
- CEO agents may use the safe routes with `target.mode = "new_company"` to create a new company directly. Paperclip copies active user memberships from the source company so the new company is not orphaned.

For export, preview first and keep tasks explicit:

- `POST /api/companies/{companyId}/exports/preview`
- `POST /api/companies/{companyId}/exports`
- Export preview defaults to `issues: false`
- Add `issues` or `projectIssues` only when you intentionally need task files
- Use `selectedFiles` to narrow the final package to specific agents, skills, projects, or tasks after you inspect the preview inventory

## Searching Issues

Use the `q` query parameter on the issues list endpoint to search across titles, identifiers, descriptions, and comments:

```
GET /api/companies/{companyId}/issues?q=dockerfile
```

Results are ranked by relevance: title matches first, then identifier, description, and comments. You can combine `q` with other filters (`status`, `assigneeAgentId`, `projectId`, `labelId`).

## Self-Test Playbook (App-Level)

Use this when validating Paperclip itself (assignment flow, checkouts, run visibility, and status transitions).

1. Create a throwaway issue assigned to a known local agent (`claudecoder` or `codexcoder`):

```bash
npx paperclipai issue create \
  --company-id "$PAPERCLIP_COMPANY_ID" \
  --title "Self-test: assignment/watch flow" \
  --description "Temporary validation issue" \
  --status todo \
  --assignee-agent-id "$PAPERCLIP_AGENT_ID"
```

2. Trigger and watch a heartbeat for that assignee:

```bash
npx paperclipai heartbeat run --agent-id "$PAPERCLIP_AGENT_ID"
```

3. Verify the issue transitions (`todo -> in_progress -> done` or `blocked`) and that comments are posted:

```bash
npx paperclipai issue get <issue-id-or-identifier>
```

4. Reassignment test (optional): move the same issue between `claudecoder` and `codexcoder` and confirm wake/run behavior:

```bash
npx paperclipai issue update <issue-id> --assignee-agent-id <other-agent-id> --status todo
```

5. Cleanup: mark temporary issues done/cancelled with a clear note.

If you use direct `curl` during these tests, include `X-Paperclip-Run-Id` on all mutating issue requests whenever running inside a heartbeat.

## Full Reference

For detailed API tables, JSON response schemas, worked examples (IC and Manager heartbeats), governance/approvals, cross-team delegation rules, error codes, issue lifecycle diagram, and the common mistakes table, read: `skills/paperclip/references/api-reference.md`
', 'local_path', '/app/skills/paperclip', NULL, 'markdown_only', 'compatible', '[{"kind": "reference", "path": "references/api-reference.md"}, {"kind": "reference", "path": "references/company-skills.md"}, {"kind": "skill", "path": "SKILL.md"}]', '{"skillKey": "paperclipai/paperclip/paperclip", "sourceKind": "paperclip_bundled"}', '2026-03-30 10:18:52.582938+00', '2026-03-31 15:27:33.945+00');
INSERT INTO public.company_skills VALUES ('f042f751-e75a-4abc-aadd-8eae311a21ea', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', 'paperclipai/paperclip/paperclip-create-agent', 'paperclip-create-agent', 'paperclip-create-agent', '>', '---
name: paperclip-create-agent
description: >
  Create new agents in Paperclip with governance-aware hiring. Use when you need
  to inspect adapter configuration options, compare existing agent configs,
  draft a new agent prompt/config, and submit a hire request.
---

# Paperclip Create Agent Skill

Use this skill when you are asked to hire/create an agent.

## Preconditions

You need either:

- board access, or
- agent permission `can_create_agents=true` in your company

If you do not have this permission, escalate to your CEO or board.

## Workflow

1. Confirm identity and company context.

```sh
curl -sS "$PAPERCLIP_API_URL/api/agents/me" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

2. Discover available adapter configuration docs for this Paperclip instance.

```sh
curl -sS "$PAPERCLIP_API_URL/llms/agent-configuration.txt" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

3. Read adapter-specific docs (example: `claude_local`).

```sh
curl -sS "$PAPERCLIP_API_URL/llms/agent-configuration/claude_local.txt" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

4. Compare existing agent configurations in your company.

```sh
curl -sS "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/agent-configurations" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

5. Discover allowed agent icons and pick one that matches the role.

```sh
curl -sS "$PAPERCLIP_API_URL/llms/agent-icons.txt" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

6. Draft the new hire config:
- role/title/name
- icon (required in practice; use one from `/llms/agent-icons.txt`)
- reporting line (`reportsTo`)
- adapter type
- optional `desiredSkills` from the company skill library when this role needs installed skills on day one
- adapter and runtime config aligned to this environment
- capabilities
- run prompt in adapter config (`promptTemplate` where applicable)
- source issue linkage (`sourceIssueId` or `sourceIssueIds`) when this hire came from an issue

7. Submit hire request.

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/agent-hires" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d ''{
    "name": "CTO",
    "role": "cto",
    "title": "Chief Technology Officer",
    "icon": "crown",
    "reportsTo": "<ceo-agent-id>",
    "capabilities": "Owns technical roadmap, architecture, staffing, execution",
    "desiredSkills": ["vercel-labs/agent-browser/agent-browser"],
    "adapterType": "codex_local",
    "adapterConfig": {"cwd": "/abs/path/to/repo", "model": "o4-mini"},
    "runtimeConfig": {"heartbeat": {"enabled": true, "intervalSec": 300, "wakeOnDemand": true}},
    "sourceIssueId": "<issue-id>"
  }''
```

8. Handle governance state:
- if response has `approval`, hire is `pending_approval`
- monitor and discuss on approval thread
- when the board approves, you will be woken with `PAPERCLIP_APPROVAL_ID`; read linked issues and close/comment follow-up

```sh
curl -sS "$PAPERCLIP_API_URL/api/approvals/<approval-id>" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"

curl -sS -X POST "$PAPERCLIP_API_URL/api/approvals/<approval-id>/comments" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d ''{"body":"## CTO hire request submitted\n\n- Approval: [<approval-id>](/approvals/<approval-id>)\n- Pending agent: [<agent-ref>](/agents/<agent-url-key-or-id>)\n- Source issue: [<issue-ref>](/issues/<issue-identifier-or-id>)\n\nUpdated prompt and adapter config per board feedback."}''
```

If the approval already exists and needs manual linking to the issue:

```sh
curl -sS -X POST "$PAPERCLIP_API_URL/api/issues/<issue-id>/approvals" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d ''{"approvalId":"<approval-id>"}''
```

After approval is granted, run this follow-up loop:

```sh
curl -sS "$PAPERCLIP_API_URL/api/approvals/$PAPERCLIP_APPROVAL_ID" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"

curl -sS "$PAPERCLIP_API_URL/api/approvals/$PAPERCLIP_APPROVAL_ID/issues" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

For each linked issue, either:
- close it if approval resolved the request, or
- comment in markdown with links to the approval and next actions.

## Quality Bar

Before sending a hire request:

- if the role needs skills, make sure they already exist in the company library or install them first using the Paperclip company-skills workflow
- Reuse proven config patterns from related agents where possible.
- Set a concrete `icon` from `/llms/agent-icons.txt` so the new hire is identifiable in org and task views.
- Avoid secrets in plain text unless required by adapter behavior.
- Ensure reporting line is correct and in-company.
- Ensure prompt is role-specific and operationally scoped.
- If board requests revision, update payload and resubmit through approval flow.

For endpoint payload shapes and full examples, read:
`skills/paperclip-create-agent/references/api-reference.md`
', 'local_path', '/app/skills/paperclip-create-agent', NULL, 'markdown_only', 'compatible', '[{"kind": "reference", "path": "references/api-reference.md"}, {"kind": "skill", "path": "SKILL.md"}]', '{"skillKey": "paperclipai/paperclip/paperclip-create-agent", "sourceKind": "paperclip_bundled"}', '2026-03-30 10:18:52.599329+00', '2026-03-31 15:27:33.953+00');
INSERT INTO public.company_skills VALUES ('842cd6a6-0c2d-4ca1-ac95-3cde5c501a72', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', 'paperclipai/paperclip/paperclip-create-plugin', 'paperclip-create-plugin', 'paperclip-create-plugin', '>', '---
name: paperclip-create-plugin
description: >
  Create new Paperclip plugins with the current alpha SDK/runtime. Use when
  scaffolding a plugin package, adding a new example plugin, or updating plugin
  authoring docs. Covers the supported worker/UI surface, route conventions,
  scaffold flow, and verification steps.
---

# Create a Paperclip Plugin

Use this skill when the task is to create, scaffold, or document a Paperclip plugin.

## 1. Ground rules

Read these first when needed:

1. `doc/plugins/PLUGIN_AUTHORING_GUIDE.md`
2. `packages/plugins/sdk/README.md`
3. `doc/plugins/PLUGIN_SPEC.md` only for future-looking context

Current runtime assumptions:

- plugin workers are trusted code
- plugin UI is trusted same-origin host code
- worker APIs are capability-gated
- plugin UI is not sandboxed by manifest capabilities
- no host-provided shared plugin UI component kit yet
- `ctx.assets` is not supported in the current runtime

## 2. Preferred workflow

Use the scaffold package instead of hand-writing the boilerplate:

```bash
pnpm --filter @paperclipai/create-paperclip-plugin build
node packages/plugins/create-paperclip-plugin/dist/index.js <npm-package-name> --output <target-dir>
```

For a plugin that lives outside the Paperclip repo, pass `--sdk-path` and let the scaffold snapshot the local SDK/shared packages into `.paperclip-sdk/`:

```bash
pnpm --filter @paperclipai/create-paperclip-plugin build
node packages/plugins/create-paperclip-plugin/dist/index.js @acme/plugin-name \
  --output /absolute/path/to/plugin-repos \
  --sdk-path /absolute/path/to/paperclip/packages/plugins/sdk
```

Recommended target inside this repo:

- `packages/plugins/examples/` for example plugins
- another `packages/plugins/<name>/` folder if it is becoming a real package

## 3. After scaffolding

Check and adjust:

- `src/manifest.ts`
- `src/worker.ts`
- `src/ui/index.tsx`
- `tests/plugin.spec.ts`
- `package.json`

Make sure the plugin:

- declares only supported capabilities
- does not use `ctx.assets`
- does not import host UI component stubs
- keeps UI self-contained
- uses `routePath` only on `page` slots
- is installed into Paperclip from an absolute local path during development

## 4. If the plugin should appear in the app

For bundled example/discoverable behavior, update the relevant host wiring:

- bundled example list in `server/src/routes/plugins.ts`
- any docs that list in-repo examples

Only do this if the user wants the plugin surfaced as a bundled example.

## 5. Verification

Always run:

```bash
pnpm --filter <plugin-package> typecheck
pnpm --filter <plugin-package> test
pnpm --filter <plugin-package> build
```

If you changed SDK/host/plugin runtime code too, also run broader repo checks as appropriate.

## 6. Documentation expectations

When authoring or updating plugin docs:

- distinguish current implementation from future spec ideas
- be explicit about the trusted-code model
- do not promise host UI components or asset APIs
- prefer npm-package deployment guidance over repo-local workflows for production
', 'local_path', '/app/skills/paperclip-create-plugin', NULL, 'markdown_only', 'compatible', '[{"kind": "skill", "path": "SKILL.md"}]', '{"skillKey": "paperclipai/paperclip/paperclip-create-plugin", "sourceKind": "paperclip_bundled"}', '2026-03-30 10:18:52.611556+00', '2026-03-31 15:27:33.959+00');
INSERT INTO public.company_skills VALUES ('f622f768-b857-4154-bdb2-00df57c84311', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', 'paperclipai/paperclip/paperclip-fullstack-guide', 'paperclip-fullstack-guide', 'paperclip-fullstack-guide', '>', '---
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
- **Reuse `assets` table** for file storage — don''t create new file tables

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

docker-compose v1.29.2 has a known bug when recreating containers. If you see `KeyError: ''ContainerConfig''`:

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
| `assets` table | `packages/db/src/schema/assets.ts` | File storage (reuse, don''t reinvent) |
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
', 'local_path', '/app/skills/paperclip-fullstack-guide', NULL, 'markdown_only', 'compatible', '[{"kind": "skill", "path": "SKILL.md"}]', '{"skillKey": "paperclipai/paperclip/paperclip-fullstack-guide", "sourceKind": "paperclip_bundled"}', '2026-03-30 18:03:33.859561+00', '2026-03-31 15:27:33.968+00');
INSERT INTO public.company_skills VALUES ('6bbcb087-2a95-474c-81e7-caef4c588a52', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', 'paperclipai/paperclip/para-memory-files', 'para-memory-files', 'para-memory-files', '>', '---
name: para-memory-files
description: >
  File-based memory system using Tiago Forte''s PARA method. Use this skill whenever
  you need to store, retrieve, update, or organize knowledge across sessions. Covers
  three memory layers: (1) Knowledge graph in PARA folders with atomic YAML facts,
  (2) Daily notes as raw timeline, (3) Tacit knowledge about user patterns. Also
  handles planning files, memory decay, weekly synthesis, and recall via qmd.
  Trigger on any memory operation: saving facts, writing daily notes, creating
  entities, running weekly synthesis, recalling past context, or managing plans.
---

# PARA Memory Files

Persistent, file-based memory organized by Tiago Forte''s PARA method. Three layers: a knowledge graph, daily notes, and tacit knowledge. All paths are relative to `$AGENT_HOME`.

## Three Memory Layers

### Layer 1: Knowledge Graph (`$AGENT_HOME/life/` -- PARA)

Entity-based storage. Each entity gets a folder with two tiers:

1. `summary.md` -- quick context, load first.
2. `items.yaml` -- atomic facts, load on demand.

```text
$AGENT_HOME/life/
  projects/          # Active work with clear goals/deadlines
    <name>/
      summary.md
      items.yaml
  areas/             # Ongoing responsibilities, no end date
    people/<name>/
    companies/<name>/
  resources/         # Reference material, topics of interest
    <topic>/
  archives/          # Inactive items from the other three
  index.md
```

**PARA rules:**

- **Projects** -- active work with a goal or deadline. Move to archives when complete.
- **Areas** -- ongoing (people, companies, responsibilities). No end date.
- **Resources** -- reference material, topics of interest.
- **Archives** -- inactive items from any category.

**Fact rules:**

- Save durable facts immediately to `items.yaml`.
- Weekly: rewrite `summary.md` from active facts.
- Never delete facts. Supersede instead (`status: superseded`, add `superseded_by`).
- When an entity goes inactive, move its folder to `$AGENT_HOME/life/archives/`.

**When to create an entity:**

- Mentioned 3+ times, OR
- Direct relationship to the user (family, coworker, partner, client), OR
- Significant project or company in the user''s life.
- Otherwise, note it in daily notes.

For the atomic fact YAML schema and memory decay rules, see [references/schemas.md](references/schemas.md).

### Layer 2: Daily Notes (`$AGENT_HOME/memory/YYYY-MM-DD.md`)

Raw timeline of events -- the "when" layer.

- Write continuously during conversations.
- Extract durable facts to Layer 1 during heartbeats.

### Layer 3: Tacit Knowledge (`$AGENT_HOME/MEMORY.md`)

How the user operates -- patterns, preferences, lessons learned.

- Not facts about the world; facts about the user.
- Update whenever you learn new operating patterns.

## Write It Down -- No Mental Notes

Memory does not survive session restarts. Files do.

- Want to remember something -> WRITE IT TO A FILE.
- "Remember this" -> update `$AGENT_HOME/memory/YYYY-MM-DD.md` or the relevant entity file.
- Learn a lesson -> update AGENTS.md, TOOLS.md, or the relevant skill file.
- Make a mistake -> document it so future-you does not repeat it.
- On-disk text files are always better than holding it in temporary context.

## Memory Recall -- Use qmd

Use `qmd` rather than grepping files:

```bash
qmd query "what happened at Christmas"   # Semantic search with reranking
qmd search "specific phrase"              # BM25 keyword search
qmd vsearch "conceptual question"         # Pure vector similarity
```

Index your personal folder: `qmd index $AGENT_HOME`

Vectors + BM25 + reranking finds things even when the wording differs.

## Planning

Keep plans in timestamped files in `plans/` at the project root (outside personal memory so other agents can access them). Use `qmd` to search plans. Plans go stale -- if a newer plan exists, do not confuse yourself with an older version. If you notice staleness, update the file to note what it is supersededBy.
', 'local_path', '/app/skills/para-memory-files', NULL, 'markdown_only', 'compatible', '[{"kind": "reference", "path": "references/schemas.md"}, {"kind": "skill", "path": "SKILL.md"}]', '{"skillKey": "paperclipai/paperclip/para-memory-files", "sourceKind": "paperclip_bundled"}', '2026-03-30 10:18:52.618245+00', '2026-03-31 15:27:33.976+00');
INSERT INTO public.company_skills VALUES ('74d843c5-e6df-4711-8d4b-fd40f920d7e6', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', 'paperclipai/paperclip/document-tree', 'document-tree', 'document-tree', '>', '---
name: document-tree
description: >
  Manage the company document library via MCP tools. Use this skill to list,
  search, read, upload, and organize documents in the structured folder tree.
  Trigger on: saving files, reading documents, organizing company knowledge,
  filing reports, or any operation involving the document library.
---

# Document Tree Skill

You have access to a **structured document library** via MCP tools (server: `doctree`). This is your company''s file system for storing and retrieving documents, reports, research, and reference materials.

## Folder Structure

Every company has a default folder hierarchy:

```
COMPANY_ROOT/
├── 01_STRATEGY_&_GOVERNANCE/        (CEO Owned)
│   ├── Vision_&_Thesis_Papers/
│   └── Executive_Summaries/
├── 02_RESEARCH_VAULT/               (Research Specialist Owned)
│   ├── 02.1_Primary_Sources/        (Screenshots, PDFs, Interview Transcripts)
│   ├── 02.2_Tech_Stack_Audits/      (Software maps, API/Integration research)
│   ├── 02.3_Pedagogical_Frameworks/ (Curriculum teardowns, Mastery-based models)
│   └── 02.4_Competitive_Intelligence/ (Social media audits, competitor analysis)
├── 03_OPERATIONS_&_EXECUTION/       (Executive Assistant Owned)
│   ├── Project_Schedules/
│   ├── Meeting_Minutes/
│   └── Resource_Directory/
└── 04_KNOWLEDGE_BASE/               (Shared/Wiki)
    └── Glossary_of_Terms/
```

## Filing Guidelines

Place documents in the correct folder based on content:

| Content Type | Folder | Examples |
|-------------|--------|---------|
| Vision, strategy, thesis papers | `01_STRATEGY_&_GOVERNANCE/Vision_&_Thesis_Papers/` | Company vision, investment thesis |
| Executive summaries, board decks | `01_STRATEGY_&_GOVERNANCE/Executive_Summaries/` | Quarterly summaries, decision briefs |
| Raw research, PDFs, transcripts | `02_RESEARCH_VAULT/02.1_Primary_Sources/` | Interview notes, downloaded papers |
| Software/API research | `02_RESEARCH_VAULT/02.2_Tech_Stack_Audits/` | Tech evaluations, integration docs |
| Curriculum/education research | `02_RESEARCH_VAULT/02.3_Pedagogical_Frameworks/` | Learning models, course teardowns |
| Competitor analysis | `02_RESEARCH_VAULT/02.4_Competitive_Intelligence/` | Market analysis, competitor profiles |
| Schedules, timelines | `03_OPERATIONS_&_EXECUTION/Project_Schedules/` | Gantt charts, sprint plans |
| Meeting notes | `03_OPERATIONS_&_EXECUTION/Meeting_Minutes/` | Standup notes, retrospectives |
| Contact lists, directories | `03_OPERATIONS_&_EXECUTION/Resource_Directory/` | Vendor list, team contacts |
| Definitions, shared reference | `04_KNOWLEDGE_BASE/Glossary_of_Terms/` | Term definitions, acronyms |

## MCP Tools Available

All tools are on the `doctree` MCP server.

### Listing & Searching

#### `list_documents` -- Browse the full tree

```
Use tool: list_documents
  company_id: "$PAPERCLIP_COMPANY_ID"   (optional, auto-detected)
```

Returns all folders and files. Use this to understand the current library state before filing new documents.

#### `search_documents` -- Find files by name

```
Use tool: search_documents
  query: "tech audit"
  company_id: "$PAPERCLIP_COMPANY_ID"
```

Searches file names across all folders. Use when you need to find a specific document.

### Reading Documents

#### `read_document` -- Get file content

```
Use tool: read_document
  asset_id: "uuid-of-the-asset"
```

Returns the text content of a document (or base64 for binary files like images/PDFs). Get the `asset_id` from `list_documents` or `search_documents` results.

### Creating & Uploading

#### `upload_document` -- Save a new document

```
Use tool: upload_document
  folder_id: "uuid-of-target-folder"
  filename: "competitive_analysis_q1.md"
  content: "# Q1 Competitive Analysis\n\n..."
```

Creates a new text document in the specified folder. Supports `.md`, `.txt`, `.json`, `.csv`, `.html` files.

**Tips:**
- Use descriptive filenames with dates where relevant
- Markdown (`.md`) is preferred for reports and notes
- Always file in the correct folder per the guidelines above

#### `create_folder` -- Add a subfolder

```
Use tool: create_folder
  parent_id: "uuid-of-parent-folder"
  name: "Q1_2026_Reports"
```

Create custom subfolders to organize documents within the standard hierarchy.

### Organizing

#### `move_document` -- Relocate a file

```
Use tool: move_document
  file_id: "uuid-of-doc-folder-file"
  target_folder_id: "uuid-of-destination-folder"
```

Move a document to a different folder. Use when a file was placed in the wrong location.

## Heartbeat Pattern

### On Wake

1. If your task involves documents, list the tree first:
   ```
   list_documents()
   ```
2. Search for relevant existing documents before creating new ones:
   ```
   search_documents(query: "topic of your task")
   ```

### On Sleep

1. If you produced any reports, analyses, or reference material during this session, upload them to the appropriate folder:
   ```
   upload_document(folder_id: "<correct folder>", filename: "descriptive_name.md", content: "<your output>")
   ```
2. Be selective -- only save documents that have lasting value. Don''t save debugging logs or temporary notes.

## Example: Full Session

```
# Wake up, check what documents exist about payment systems
search_documents(query: "payment")
# -> Returns: tech_audit_payment_gateway.md in 02.2_Tech_Stack_Audits

# Read the existing audit
read_document(asset_id: "abc-123")
# -> Returns content of the payment gateway audit

# Do research work...
# Produce a new competitive analysis

# Save it to the right folder
list_documents()
# -> Find the folder ID for 02.4_Competitive_Intelligence

upload_document(
  folder_id: "def-456",
  filename: "payment_competitor_analysis_2026_q1.md",
  content: "# Payment Competitor Analysis Q1 2026\n\n..."
)
```
', 'local_path', '/app/skills/document-tree', NULL, 'markdown_only', 'compatible', '[{"kind": "skill", "path": "SKILL.md"}]', '{"skillKey": "paperclipai/paperclip/document-tree", "sourceKind": "paperclip_bundled"}', '2026-03-30 17:49:25.150176+00', '2026-03-31 15:27:33.921+00');
INSERT INTO public.company_skills VALUES ('77e3326a-29d1-4e1e-8c7d-1665e66bca2e', 'd614ecc3-b46c-47cc-af90-7d2b33e0a47e', 'paperclipai/paperclip/graphiti-memory', 'graphiti-memory', 'graphiti-memory', '>', '---
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
      content: "Let me check what auth system we''re using."
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
2. **Use the results** to inform your work. Don''t repeat solved problems or contradict past decisions.

### On Sleep (end of heartbeat)

1. **Store what you learned.** Before exiting, ingest any new facts, decisions, or context:
   ```
   add_messages(group_id: "project-{id}", messages: [{content: "<summary of what happened>", role_type: "system"}])
   ```
2. **Be selective.** Don''t store routine operations. Store decisions, discoveries, errors, and their resolutions.

## What Makes Good Memory

**Store:**
- Architectural decisions and their rationale
- Bug root causes and fixes
- Entity relationships (service dependencies, team ownership, API contracts)
- User preferences and corrections
- Domain knowledge that''s not obvious from code

**Don''t store:**
- Raw code (it''s in git)
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
', 'local_path', '/app/skills/graphiti-memory', NULL, 'markdown_only', 'compatible', '[{"kind": "skill", "path": "SKILL.md"}]', '{"skillKey": "paperclipai/paperclip/graphiti-memory", "sourceKind": "paperclip_bundled"}', '2026-03-30 16:47:33.925994+00', '2026-03-31 15:27:33.928+00');


--
-- PostgreSQL database dump complete
--

\unrestrict uq1q4saz5txE1KPELBX5bK7yUWdwXs2agocOjR77WtxpO9n554cWW3OGZSz2Vbr

