import { eq, and, or, asc, isNull, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { docFolders, docFolderFiles, assets, agents } from "@paperclipai/db";

const DEFAULT_TREE = [
  {
    name: "00_PAPERCLIP_ROOT",
    ownerRole: "all",
    sortOrder: 0,
    children: [] as { name: string; sortOrder: number }[],
  },
  {
    name: "01_STRATEGY_&_GOVERNANCE",
    ownerRole: "ceo",
    sortOrder: 1,
    children: [
      { name: "Vision_&_Thesis_Papers", sortOrder: 1 },
      { name: "Executive_Summaries", sortOrder: 2 },
    ],
  },
  {
    name: "02_RESEARCH_VAULT",
    ownerRole: "research_specialist",
    sortOrder: 2,
    children: [
      { name: "02.1_Primary_Sources", sortOrder: 1 },
      { name: "02.2_Tech_Stack_Audits", sortOrder: 2 },
      { name: "02.3_Pedagogical_Frameworks", sortOrder: 3 },
      { name: "02.4_Competitive_Intelligence", sortOrder: 4 },
    ],
  },
  {
    name: "03_OPERATIONS_&_EXECUTION",
    ownerRole: "executive_assistant",
    sortOrder: 3,
    children: [
      { name: "Project_Schedules", sortOrder: 1 },
      { name: "Meeting_Minutes", sortOrder: 2 },
      { name: "Resource_Directory", sortOrder: 3 },
    ],
  },
  {
    name: "04_KNOWLEDGE_BASE",
    ownerRole: "shared",
    sortOrder: 4,
    children: [
      { name: "Glossary_of_Terms", sortOrder: 1 },
    ],
  },
];

export function docTreeService(db: Db) {
  return {
    async seedDefaultFolders(companyId: string) {
      const existing = await db
        .select({ id: docFolders.id, path: docFolders.path })
        .from(docFolders)
        .where(and(eq(docFolders.companyId, companyId), isNull(docFolders.parentId)));

      const existingPaths = new Set(existing.map((f) => f.path));

      if (existing.length > 0) {
        // Add any missing root folders (e.g. Paperclip Root added after initial seed)
        let added = false;
        for (const top of DEFAULT_TREE) {
          const topPath = `/${top.name}`;
          if (existingPaths.has(topPath)) continue;
          added = true;
          const [parent] = await db
            .insert(docFolders)
            .values({ companyId, parentId: null, name: top.name, path: topPath, ownerRole: top.ownerRole, sortOrder: top.sortOrder })
            .returning();
          for (const child of top.children) {
            await db.insert(docFolders).values({ companyId, parentId: parent.id, name: child.name, path: `${topPath}/${child.name}`, ownerRole: top.ownerRole, sortOrder: child.sortOrder });
          }
        }
        return { seeded: added };
      }

      for (const top of DEFAULT_TREE) {
        const topPath = `/${top.name}`;
        const [parent] = await db
          .insert(docFolders)
          .values({
            companyId,
            parentId: null,
            name: top.name,
            path: topPath,
            ownerRole: top.ownerRole,
            sortOrder: top.sortOrder,
          })
          .returning();

        for (const child of top.children) {
          await db.insert(docFolders).values({
            companyId,
            parentId: parent.id,
            name: child.name,
            path: `${topPath}/${child.name}`,
            ownerRole: top.ownerRole,
            sortOrder: child.sortOrder,
          });
        }
      }

      return { seeded: true };
    },

    async listTree(companyId: string, search?: string, agentId?: string) {
      const allFolders = await db
        .select()
        .from(docFolders)
        .where(eq(docFolders.companyId, companyId))
        .orderBy(asc(docFolders.sortOrder), asc(docFolders.name));

      // When scoped to an agent, determine which roles grant folder access
      let accessibleRoles: string[] | null = null;
      if (agentId) {
        const agent = await db
          .select({ name: agents.name, role: agents.role })
          .from(agents)
          .where(eq(agents.id, agentId))
          .then((rows) => rows[0] ?? null);

        if (agent) {
          // Map agent name/role to folder ownerRoles they can access
          // "shared" and "all" (Paperclip Root) are always accessible
          accessibleRoles = ["shared", "all"];
          const nameLower = agent.name.toLowerCase();

          if (agent.role === "ceo" || nameLower.includes("ceo")) {
            accessibleRoles.push("ceo");
          }
          if (nameLower.includes("research")) {
            accessibleRoles.push("research_specialist");
          }
          if (nameLower.includes("executive assistant")) {
            accessibleRoles.push("executive_assistant");
          }
          // CEO, Executive Assistant, Marie, and Amy get full access to all folders
          if (agent.role === "ceo" || nameLower.includes("executive assistant") || nameLower.includes("marie") || nameLower.includes("amy")) {
            accessibleRoles = ["all", "ceo", "research_specialist", "executive_assistant", "shared"];
          }
        }
      }

      // Filter folders by agent role access
      let folders = allFolders;
      let accessibleFolderIds: Set<string> | null = null;
      if (accessibleRoles) {
        const rootFolderIds = new Set(
          allFolders
            .filter((f) => f.parentId === null && f.ownerRole && accessibleRoles!.includes(f.ownerRole))
            .map((f) => f.id),
        );
        accessibleFolderIds = new Set(
          allFolders
            .filter((f) => rootFolderIds.has(f.id) || (f.parentId && rootFolderIds.has(f.parentId)))
            .map((f) => f.id),
        );
        folders = allFolders.filter((f) => accessibleFolderIds!.has(f.id));
      }

      // Fetch files:
      // - No agent scope: show all files
      // - Agent scope: show files owned by this agent (in any folder) + unassigned files in role-accessible folders
      let fileConditions;
      if (agentId && accessibleFolderIds && accessibleFolderIds.size > 0) {
        fileConditions = and(
          eq(docFolderFiles.companyId, companyId),
          or(
            eq(docFolderFiles.agentId, agentId),
            and(isNull(docFolderFiles.agentId), inArray(docFolderFiles.folderId, [...accessibleFolderIds])),
          ),
        );
      } else if (agentId) {
        fileConditions = and(eq(docFolderFiles.companyId, companyId), eq(docFolderFiles.agentId, agentId));
      } else {
        fileConditions = eq(docFolderFiles.companyId, companyId);
      }

      const files = await db
        .select({
          id: docFolderFiles.id,
          folderId: docFolderFiles.folderId,
          assetId: docFolderFiles.assetId,
          displayName: docFolderFiles.displayName,
          sourceType: docFolderFiles.sourceType,
          sourceRef: docFolderFiles.sourceRef,
          sortOrder: docFolderFiles.sortOrder,
          createdAt: docFolderFiles.createdAt,
          agentId: docFolderFiles.agentId,
          contentType: assets.contentType,
          byteSize: assets.byteSize,
          originalFilename: assets.originalFilename,
        })
        .from(docFolderFiles)
        .innerJoin(assets, eq(docFolderFiles.assetId, assets.id))
        .where(fileConditions)
        .orderBy(asc(docFolderFiles.sortOrder), asc(docFolderFiles.createdAt));

      let filteredFiles = files;
      if (search) {
        filteredFiles = files.filter(
          (f) =>
            (f.displayName ?? f.originalFilename ?? "")
              .toLowerCase()
              .includes(search.toLowerCase()),
        );
      }

      return { folders, files: filteredFiles };
    },

    async createFolder(companyId: string, parentId: string | null, name: string) {
      let parentPath = "";
      if (parentId) {
        const parent = await db
          .select({ path: docFolders.path })
          .from(docFolders)
          .where(and(eq(docFolders.id, parentId), eq(docFolders.companyId, companyId)))
          .then((rows) => rows[0]);
        if (!parent) throw new Error("Parent folder not found");
        parentPath = parent.path;
      }

      const path = `${parentPath}/${name}`;
      const [folder] = await db
        .insert(docFolders)
        .values({ companyId, parentId, name, path, sortOrder: 0 })
        .returning();

      return folder;
    },

    async renameFolder(companyId: string, folderId: string, name: string) {
      const folder = await db
        .select()
        .from(docFolders)
        .where(and(eq(docFolders.id, folderId), eq(docFolders.companyId, companyId)))
        .then((rows) => rows[0]);

      if (!folder) return null;

      const oldPath = folder.path;
      const parentPath = oldPath.substring(0, oldPath.lastIndexOf("/"));
      const newPath = `${parentPath}/${name}`;

      const [updated] = await db
        .update(docFolders)
        .set({ name, path: newPath, updatedAt: new Date() })
        .where(eq(docFolders.id, folderId))
        .returning();

      // Update child paths
      const children = await db
        .select()
        .from(docFolders)
        .where(eq(docFolders.companyId, companyId));

      for (const child of children) {
        if (child.path.startsWith(oldPath + "/")) {
          const childNewPath = newPath + child.path.substring(oldPath.length);
          await db
            .update(docFolders)
            .set({ path: childNewPath, updatedAt: new Date() })
            .where(eq(docFolders.id, child.id));
        }
      }

      return updated;
    },

    async deleteFolder(companyId: string, folderId: string) {
      const children = await db
        .select({ id: docFolders.id })
        .from(docFolders)
        .where(and(eq(docFolders.parentId, folderId), eq(docFolders.companyId, companyId)))
        .limit(1);

      if (children.length > 0) {
        throw new Error("Cannot delete folder with subfolders");
      }

      const files = await db
        .select({ id: docFolderFiles.id })
        .from(docFolderFiles)
        .where(eq(docFolderFiles.folderId, folderId))
        .limit(1);

      if (files.length > 0) {
        throw new Error("Cannot delete folder with files");
      }

      await db.delete(docFolders).where(and(eq(docFolders.id, folderId), eq(docFolders.companyId, companyId)));
      return { deleted: true };
    },

    async addFile(
      companyId: string,
      folderId: string,
      assetId: string,
      displayName: string | null,
      sourceType: string,
      sourceRef: string | null,
      agentId?: string | null,
    ) {
      const [file] = await db
        .insert(docFolderFiles)
        .values({ companyId, folderId, assetId, displayName, sourceType, sourceRef, sortOrder: 0, agentId: agentId ?? null })
        .returning();
      return file;
    },

    async moveFile(companyId: string, fileId: string, targetFolderId: string, displayName?: string) {
      const updates: Record<string, unknown> = { folderId: targetFolderId, updatedAt: new Date() };
      if (displayName !== undefined) updates.displayName = displayName;

      const [updated] = await db
        .update(docFolderFiles)
        .set(updates)
        .where(and(eq(docFolderFiles.id, fileId), eq(docFolderFiles.companyId, companyId)))
        .returning();

      return updated ?? null;
    },

    async removeFile(companyId: string, fileId: string) {
      await db
        .delete(docFolderFiles)
        .where(and(eq(docFolderFiles.id, fileId), eq(docFolderFiles.companyId, companyId)));
      return { deleted: true };
    },
  };
}
