import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const docFolders = pgTable(
  "doc_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    path: text("path").notNull(),
    ownerRole: text("owner_role"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyParentIdx: index("doc_folders_company_parent_idx").on(table.companyId, table.parentId),
    companyPathUq: uniqueIndex("doc_folders_company_path_uq").on(table.companyId, table.path),
  }),
);
