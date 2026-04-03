import { Router } from "express";
import multer from "multer";
import { eq, and } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { docFolderFiles, assets, agentBrainFolders, docFolders } from "@paperclipai/db";
import type { StorageService } from "../storage/types.js";
import { docTreeService } from "../services/doc-tree.js";
import { assetService, logActivity } from "../services/index.js";
import { isAllowedContentType, MAX_ATTACHMENT_BYTES } from "../attachment-types.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { badRequest, notFound, forbidden } from "../errors.js";

export function docTreeRoutes(db: Db, storage: StorageService) {
  const router = Router();
  const svc = docTreeService(db);
  const assetSvc = assetService(db);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
  });

  // Get full document tree
  router.get("/companies/:companyId/doc-tree", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const agentId = typeof req.query.agentId === "string" ? req.query.agentId : undefined;
    const tree = await svc.listTree(companyId, search, agentId);
    res.json(tree);
  });

  // Seed default folder structure
  router.post("/companies/:companyId/doc-tree/seed", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const result = await svc.seedDefaultFolders(companyId);

    if (result.seeded) {
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "doc_tree.seeded",
        entityType: "doc_folder",
        entityId: companyId,
        details: { message: "Default document tree seeded" },
      });
    }

    res.json(result);
  });

  // Create folder
  router.post("/companies/:companyId/doc-tree/folders", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const { parentId, name } = req.body;
    if (!name || typeof name !== "string") throw badRequest("name is required");

    const folder = await svc.createFolder(companyId, parentId ?? null, name);

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "doc_folder.created",
      entityType: "doc_folder",
      entityId: folder.id,
      details: { name: folder.name, path: folder.path },
    });

    res.status(201).json(folder);
  });

  // Rename folder
  router.patch("/companies/:companyId/doc-tree/folders/:folderId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const folderId = req.params.folderId as string;
    assertCompanyAccess(req, companyId);

    const { name } = req.body;
    if (!name || typeof name !== "string") throw badRequest("name is required");

    const folder = await svc.renameFolder(companyId, folderId, name);
    if (!folder) throw notFound("Folder not found");

    res.json(folder);
  });

  // Delete folder (board users only)
  router.delete("/companies/:companyId/doc-tree/folders/:folderId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const folderId = req.params.folderId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);

    try {
      const result = await svc.deleteFolder(companyId, folderId);
      res.json(result);
    } catch (err) {
      throw badRequest((err as Error).message);
    }
  });

  // Upload file to folder
  router.post("/companies/:companyId/doc-tree/folders/:folderId/upload", async (req, res) => {
    const companyId = req.params.companyId as string;
    const folderId = req.params.folderId as string;
    assertCompanyAccess(req, companyId);

    await new Promise<void>((resolve, reject) => {
      upload.single("file")(req, res, (err: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const file = (req as any).file;
    if (!file) throw badRequest("Missing file field 'file'");

    const contentType = (file.mimetype || "").toLowerCase();
    if (!isAllowedContentType(contentType)) {
      res.status(422).json({ error: `Unsupported file type: ${contentType || "unknown"}` });
      return;
    }

    const actor = getActorInfo(req);

    // Store the file as an asset
    const stored = await storage.putFile({
      companyId,
      namespace: "assets/documents",
      originalFilename: file.originalname || null,
      contentType,
      body: file.buffer,
    });

    const asset = await assetSvc.create(companyId, {
      provider: stored.provider,
      objectKey: stored.objectKey,
      contentType: stored.contentType,
      byteSize: stored.byteSize,
      sha256: stored.sha256,
      originalFilename: stored.originalFilename,
      createdByAgentId: actor.agentId,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
    });

    // Link asset to folder
    const displayName = typeof req.body?.displayName === "string" ? req.body.displayName : null;
    const agentId = typeof req.body?.agentId === "string" ? req.body.agentId : null;
    const docFile = await svc.addFile(companyId, folderId, asset.id, displayName, "upload", null, agentId);

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "doc_file.uploaded",
      entityType: "doc_folder_file",
      entityId: docFile.id,
      details: {
        folderId,
        originalFilename: asset.originalFilename,
        contentType: asset.contentType,
        byteSize: asset.byteSize,
      },
    });

    res.status(201).json({
      ...docFile,
      contentType: asset.contentType,
      byteSize: asset.byteSize,
      originalFilename: asset.originalFilename,
      contentPath: `/api/assets/${asset.id}/content`,
    });
  });

  // Import from Google Drive
  router.post("/companies/:companyId/doc-tree/folders/:folderId/import-drive", async (req, res) => {
    const companyId = req.params.companyId as string;
    const folderId = req.params.folderId as string;
    assertCompanyAccess(req, companyId);

    const { driveFileId, fileName } = req.body;
    if (!driveFileId || typeof driveFileId !== "string") throw badRequest("driveFileId is required");

    // Download from Google Drive using @googleworkspace/cli
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { readFile, unlink } = await import("node:fs/promises");
    const execFileAsync = promisify(execFile);

    const tmpPath = join(tmpdir(), `gdrive-${Date.now()}-${driveFileId}`);

    try {
      await execFileAsync("gw", ["drive", "files", "export", driveFileId, "--output", tmpPath], {
        timeout: 60_000,
      });
    } catch {
      // Try download instead of export (for non-Google-native files)
      try {
        await execFileAsync("gw", ["drive", "files", "download", driveFileId, "--output", tmpPath], {
          timeout: 60_000,
        });
      } catch (downloadErr) {
        res.status(502).json({ error: `Failed to download from Google Drive: ${(downloadErr as Error).message}` });
        return;
      }
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(tmpPath);
    } finally {
      await unlink(tmpPath).catch(() => {});
    }

    const guessedName = typeof fileName === "string" ? fileName : `drive-${driveFileId}`;
    const ext = guessedName.split(".").pop()?.toLowerCase() ?? "";
    const mimeMap: Record<string, string> = {
      pdf: "application/pdf",
      md: "text/markdown",
      txt: "text/plain",
      json: "application/json",
      csv: "text/csv",
      html: "text/html",
      htm: "text/html",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };
    const contentType = mimeMap[ext] || "application/octet-stream";

    const actor = getActorInfo(req);

    const stored = await storage.putFile({
      companyId,
      namespace: "assets/documents",
      originalFilename: guessedName,
      contentType,
      body: fileBuffer,
    });

    const asset = await assetSvc.create(companyId, {
      provider: stored.provider,
      objectKey: stored.objectKey,
      contentType: stored.contentType,
      byteSize: stored.byteSize,
      sha256: stored.sha256,
      originalFilename: stored.originalFilename,
      createdByAgentId: actor.agentId,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
    });

    const docFile = await svc.addFile(
      companyId,
      folderId,
      asset.id,
      guessedName,
      "google_drive",
      driveFileId,
    );

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "doc_file.imported_drive",
      entityType: "doc_folder_file",
      entityId: docFile.id,
      details: { folderId, driveFileId, fileName: guessedName },
    });

    res.status(201).json({
      ...docFile,
      contentType: asset.contentType,
      byteSize: asset.byteSize,
      originalFilename: asset.originalFilename,
      contentPath: `/api/assets/${asset.id}/content`,
    });
  });

  // Move/rename file
  router.patch("/companies/:companyId/doc-tree/files/:fileId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const fileId = req.params.fileId as string;
    assertCompanyAccess(req, companyId);

    const { folderId, displayName } = req.body;
    if (!folderId && displayName === undefined) throw badRequest("folderId or displayName required");

    const updated = await svc.moveFile(companyId, fileId, folderId, displayName);
    if (!updated) throw notFound("File not found");

    res.json(updated);
  });

  // Remove file from folder (board users only)
  router.delete("/companies/:companyId/doc-tree/files/:fileId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const fileId = req.params.fileId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);

    const result = await svc.removeFile(companyId, fileId);
    res.json(result);
  });

  // List Google Drive files
  router.get("/companies/:companyId/doc-tree/google-drive", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const pageSize = Number(req.query.pageSize) || 20;
    const pageToken = typeof req.query.pageToken === "string" ? req.query.pageToken : undefined;
    const query = typeof req.query.q === "string" ? req.query.q : undefined;

    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    try {
      const params: Record<string, unknown> = {
        pageSize,
        fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink,iconLink,owners)",
        orderBy: "modifiedTime desc",
      };
      if (pageToken) params.pageToken = pageToken;
      if (query) {
        params.q = `name contains '${query.replace(/'/g, "\\'")}'`;
      }

      const { stdout } = await execFileAsync(
        "npx",
        ["@googleworkspace/cli", "drive", "files", "list", "--params", JSON.stringify(params)],
        { timeout: 30_000, env: { ...process.env } },
      );

      const data = JSON.parse(stdout);
      res.json({
        files: (data.files || []).map((f: any) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          modifiedTime: f.modifiedTime,
          size: f.size ? Number(f.size) : null,
          webViewLink: f.webViewLink,
          iconLink: f.iconLink,
          owner: f.owners?.[0]?.displayName ?? null,
        })),
        nextPageToken: data.nextPageToken || null,
      });
    } catch (err) {
      const message = (err as Error).message || "Unknown error";
      if (message.includes("auth") || message.includes("login") || message.includes("credential")) {
        res.status(401).json({ error: "Google Drive authentication required. Run: gws auth login" });
      } else {
        res.status(502).json({ error: `Google Drive error: ${message}` });
      }
    }
  });

  // Browse Google Drive folder contents
  router.get("/companies/:companyId/doc-tree/google-drive/folder/:folderId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const folderId = req.params.folderId as string;
    assertCompanyAccess(req, companyId);

    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    try {
      const params: Record<string, unknown> = {
        pageSize: 100,
        q: `'${folderId}' in parents and trashed = false`,
        fields: "files(id,name,mimeType,modifiedTime,size,webViewLink)",
        orderBy: "folder,name",
      };

      const { stdout } = await execFileAsync(
        "npx",
        ["@googleworkspace/cli", "drive", "files", "list", "--params", JSON.stringify(params)],
        { timeout: 30_000, env: { ...process.env } },
      );

      const data = JSON.parse(stdout);
      res.json({
        files: (data.files || []).map((f: any) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          modifiedTime: f.modifiedTime,
          size: f.size ? Number(f.size) : null,
          webViewLink: f.webViewLink,
          isFolder: f.mimeType === "application/vnd.google-apps.folder",
        })),
      });
    } catch (err) {
      const message = (err as Error).message || "Unknown error";
      res.status(502).json({ error: `Google Drive error: ${message}` });
    }
  });

  // List Google Calendar events
  router.get("/companies/:companyId/doc-tree/google-calendar", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const timeMin = typeof req.query.timeMin === "string" ? req.query.timeMin : new Date().toISOString();
    const timeMax = typeof req.query.timeMax === "string" ? req.query.timeMax : undefined;
    const maxResults = Number(req.query.maxResults) || 50;

    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    try {
      const params: Record<string, unknown> = {
        calendarId: "primary",
        timeMin,
        maxResults,
        singleEvents: true,
        orderBy: "startTime",
      };
      if (timeMax) params.timeMax = timeMax;

      const { stdout } = await execFileAsync(
        "npx",
        ["@googleworkspace/cli", "calendar", "events", "list", "--params", JSON.stringify(params)],
        { timeout: 30_000, env: { ...process.env } },
      );

      const data = JSON.parse(stdout);
      res.json({
        events: (data.items || []).map((e: any) => ({
          id: e.id,
          summary: e.summary ?? "No Title",
          description: e.description ?? null,
          start: e.start?.dateTime ?? e.start?.date ?? null,
          end: e.end?.dateTime ?? e.end?.date ?? null,
          location: e.location ?? null,
          status: e.status ?? "confirmed",
          htmlLink: e.htmlLink ?? null,
          colorId: e.colorId ?? null,
          creator: e.creator?.email ?? null,
          attendees: (e.attendees ?? []).map((a: any) => ({
            email: a.email,
            displayName: a.displayName ?? null,
            responseStatus: a.responseStatus ?? null,
          })),
        })),
      });
    } catch (err) {
      const message = (err as Error).message || "Unknown error";
      if (message.includes("auth") || message.includes("login") || message.includes("credential")) {
        res.status(401).json({ error: "Google Calendar authentication required." });
      } else {
        res.status(502).json({ error: `Google Calendar error: ${message}` });
      }
    }
  });

  // Train agent brain on a Google Drive folder
  router.post("/companies/:companyId/agents/:agentId/train-brain", async (req, res) => {
    const companyId = req.params.companyId as string;
    const agentId = req.params.agentId as string;
    assertCompanyAccess(req, companyId);

    const { driveFolderId, driveFolderName } = req.body;
    if (!driveFolderId || typeof driveFolderId !== "string") throw badRequest("driveFolderId is required");

    const GRAPHITI_URL = process.env.GRAPHITI_URL || "http://graphiti:8000";
    const groupId = `agent-${agentId}`;

    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { readFile, unlink } = await import("node:fs/promises");
    const execFileAsync = promisify(execFile);

    // List all files in the Drive folder (recursively)
    async function listDriveFiles(fId: string): Promise<{ id: string; name: string; mimeType: string }[]> {
      const params = {
        pageSize: 200,
        q: `'${fId}' in parents and trashed = false`,
        fields: "files(id,name,mimeType)",
      };
      const { stdout } = await execFileAsync(
        "npx",
        ["@googleworkspace/cli", "drive", "files", "list", "--params", JSON.stringify(params)],
        { timeout: 30_000, env: { ...process.env } },
      );
      const data = JSON.parse(stdout);
      const results: { id: string; name: string; mimeType: string }[] = [];
      for (const f of data.files || []) {
        if (f.mimeType === "application/vnd.google-apps.folder") {
          const sub = await listDriveFiles(f.id);
          results.push(...sub);
        } else {
          results.push({ id: f.id, name: f.name, mimeType: f.mimeType });
        }
      }
      return results;
    }

    let ingested = 0;
    let totalFiles = 0;
    let downloaded = 0;

    // ── Phase 1: Download ALL files from Google Drive first ──
    const { mkdtemp } = await import("node:fs/promises");
    const downloadDir = await mkdtemp(join(tmpdir(), "brain-dl-"));
    const downloadedFiles: { name: string; content: string }[] = [];

    try {
      const driveFiles = await listDriveFiles(driveFolderId);
      totalFiles = driveFiles.length;

      for (const file of driveFiles) {
        try {
          let content = "";
          const tmpFilename = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

          if (file.mimeType.startsWith("application/vnd.google-apps.")) {
            // Google Docs/Sheets/Slides: export as text
            try {
              await execFileAsync(
                "npx",
                ["@googleworkspace/cli", "drive", "files", "export",
                  "--params", JSON.stringify({ fileId: file.id, mimeType: "text/plain" }),
                  "--output", tmpFilename],
                { timeout: 60_000, env: { ...process.env }, cwd: downloadDir },
              );
              content = await readFile(join(downloadDir, tmpFilename), "utf-8");
            } catch {
              continue;
            } finally {
              await unlink(join(downloadDir, tmpFilename)).catch(() => {});
            }
          } else {
            // Regular files — skip binary media
            const skipMimes = ["image/", "video/", "audio/"];
            if (skipMimes.some((t) => file.mimeType.startsWith(t))) continue;

            try {
              await execFileAsync(
                "npx",
                ["@googleworkspace/cli", "drive", "files", "get",
                  "--params", JSON.stringify({ fileId: file.id, alt: "media" }),
                  "--output", tmpFilename],
                { timeout: 60_000, env: { ...process.env }, cwd: downloadDir },
              );
              content = await readFile(join(downloadDir, tmpFilename), "utf-8");
            } catch {
              continue;
            } finally {
              await unlink(join(downloadDir, tmpFilename)).catch(() => {});
            }
          }

          if (!content.trim()) continue;
          downloadedFiles.push({ name: file.name, content });
          downloaded++;
        } catch {
          // Skip individual download errors
        }
      }
    } catch (err) {
      // Clean up download dir
      const { rm } = await import("node:fs/promises");
      await rm(downloadDir, { recursive: true, force: true }).catch(() => {});
      res.status(502).json({ error: `Failed to download Drive folder: ${(err as Error).message}` });
      return;
    }

    // Clean up download dir
    const { rm } = await import("node:fs/promises");
    await rm(downloadDir, { recursive: true, force: true }).catch(() => {});

    // ── Phase 2: Ingest ALL downloaded files into Graphiti ──
    for (const file of downloadedFiles) {
      try {
        const CHUNK_SIZE = 4000;
        const chunks: string[] = [];
        for (let i = 0; i < file.content.length; i += CHUNK_SIZE) {
          chunks.push(file.content.slice(i, i + CHUNK_SIZE));
        }

        for (let ci = 0; ci < chunks.length; ci++) {
          const chunkName = chunks.length > 1 ? `${file.name} (Part ${ci + 1})` : file.name;
          await fetch(`${GRAPHITI_URL}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              group_id: groupId,
              messages: [
                {
                  name: chunkName,
                  role: "system",
                  role_type: "system",
                  content: chunks[ci],
                  source_description: `Training: ${chunkName} (Google Drive)`,
                },
              ],
            }),
          });
        }

        ingested++;
      } catch {
        // Skip individual ingestion errors
      }
    }

    if (downloaded === 0) {
      res.status(400).json({ error: `Downloaded 0 files from ${totalFiles} found. Check Drive permissions or file types.` });
      return;
    }

    // Record training — use a stable unique key per agent
    await db.delete(agentBrainFolders).where(eq(agentBrainFolders.agentId, agentId));
    await db.insert(agentBrainFolders).values({
      companyId,
      agentId,
      folderId: null,
      driveFolderId,
      driveFolderName: driveFolderName || driveFolderId,
      fileCount: ingested,
    });

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent_brain.trained",
      entityType: "agent",
      entityId: agentId,
      details: { driveFolderId, driveFolderName, filesDownloaded: downloaded, filesIngested: ingested, totalFiles },
    });

    res.json({ trained: true, documentsDownloaded: downloaded, documentsIngested: ingested, totalFiles });
  });

  // Query agent brain (Graphiti search) — for verification/testing
  router.post("/companies/:companyId/agents/:agentId/query-brain", async (req, res) => {
    const companyId = req.params.companyId as string;
    const agentId = req.params.agentId as string;
    assertCompanyAccess(req, companyId);

    const { query, maxFacts } = req.body;
    if (!query || typeof query !== "string") throw badRequest("query is required");

    const GRAPHITI_URL = process.env.GRAPHITI_URL || "http://graphiti:8000";
    const groupId = `agent-${agentId}`;

    try {
      const searchRes = await fetch(`${GRAPHITI_URL}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          group_ids: [groupId],
          max_facts: maxFacts || 10,
        }),
      });

      if (!searchRes.ok) {
        const errText = await searchRes.text();
        res.status(502).json({ error: `Graphiti search failed (${searchRes.status}): ${errText}` });
        return;
      }

      const data = await searchRes.json() as { facts: { uuid: string; name: string; fact: string }[] };

      // Pass facts to claude -p directly — no MCP overhead
      let answer: string | null = null;
      if (data.facts && data.facts.length > 0) {
        try {
          const { spawn } = await import("node:child_process");
          const factsText = data.facts.map((f: { name: string; fact: string }) => `- ${f.fact}`).join("\n");
          const prompt = `Answer this question concisely based ONLY on these facts. Do not make up information.\n\nQuestion: ${query}\n\nFacts:\n${factsText}`;

          answer = await new Promise<string | null>((resolve) => {
            const child = spawn("claude", ["-p", prompt], {
              env: { ...process.env, HOME: "/paperclip" },
              stdio: ["ignore", "pipe", "pipe"],
              timeout: 30_000,
            });
            let out = "";
            child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString(); });
            child.on("close", () => resolve(out.trim() || null));
            child.on("error", () => resolve(null));
          });
        } catch {
          // Claude call failed — still return facts
        }
      }

      res.json({ ...data, answer });
    } catch (err) {
      res.status(502).json({ error: `Graphiti connection error: ${(err as Error).message}` });
    }
  });

  // Get agent brain status
  router.get("/companies/:companyId/agents/:agentId/brain-status", async (req, res) => {
    const companyId = req.params.companyId as string;
    const agentId = req.params.agentId as string;
    assertCompanyAccess(req, companyId);

    const trained = await db
      .select({
        folderId: agentBrainFolders.folderId,
        driveFolderId: agentBrainFolders.driveFolderId,
        driveFolderName: agentBrainFolders.driveFolderName,
        fileCount: agentBrainFolders.fileCount,
        trainedAt: agentBrainFolders.trainedAt,
      })
      .from(agentBrainFolders)
      .where(and(eq(agentBrainFolders.agentId, agentId), eq(agentBrainFolders.companyId, companyId)));

    res.json({
      trainedFolders: trained.map((t) => ({
        folderId: t.folderId,
        driveFolderId: t.driveFolderId,
        folderName: t.driveFolderName ?? "Unknown",
        fileCount: t.fileCount,
        trainedAt: t.trainedAt,
      })),
      totalFolders: trained.length,
      totalFiles: trained.reduce((sum, t) => sum + t.fileCount, 0),
      lastTrainedAt: trained.length > 0
        ? trained.sort((a, b) => new Date(b.trainedAt).getTime() - new Date(a.trainedAt).getTime())[0].trainedAt
        : null,
    });
  });

  return router;
}
