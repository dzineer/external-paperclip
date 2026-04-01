import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { docFolders } from "./doc_folders.js";

export const agentBrainFolders = pgTable(
  "agent_brain_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    folderId: uuid("folder_id").references(() => docFolders.id),
    driveFolderId: text("drive_folder_id"),
    driveFolderName: text("drive_folder_name"),
    fileCount: integer("file_count").notNull().default(0),
    trainedAt: timestamp("trained_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentIdx: index("agent_brain_folders_agent_idx").on(table.agentId),
    agentFolderUq: uniqueIndex("agent_brain_folders_agent_folder_uq").on(table.agentId, table.folderId),
  }),
);
