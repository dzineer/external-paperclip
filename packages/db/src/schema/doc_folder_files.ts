import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { docFolders } from "./doc_folders.js";
import { assets } from "./assets.js";
import { agents } from "./agents.js";

export const docFolderFiles = pgTable(
  "doc_folder_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    folderId: uuid("folder_id").notNull().references(() => docFolders.id),
    assetId: uuid("asset_id").notNull().references(() => assets.id),
    displayName: text("display_name"),
    sourceType: text("source_type").notNull().default("upload"),
    sourceRef: text("source_ref"),
    agentId: uuid("agent_id").references(() => agents.id),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    folderIdx: index("doc_folder_files_folder_idx").on(table.folderId),
    companyIdx: index("doc_folder_files_company_idx").on(table.companyId),
    agentIdx: index("doc_folder_files_agent_idx").on(table.agentId),
    assetUq: uniqueIndex("doc_folder_files_asset_uq").on(table.folderId, table.assetId),
  }),
);
