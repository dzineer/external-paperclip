---
name: document-tree
description: >
  Manage the company document library via MCP tools. Use this skill to list,
  search, read, upload, and organize documents in the structured folder tree.
  Trigger on: saving files, reading documents, organizing company knowledge,
  filing reports, or any operation involving the document library.
---

# Document Tree Skill

You have access to a **structured document library** via MCP tools (server: `doctree`). This is your company's file system for storing and retrieving documents, reports, research, and reference materials.

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
2. Be selective -- only save documents that have lasting value. Don't save debugging logs or temporary notes.

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
