import { Router } from "express";
import multer from "multer";
import type { Db } from "@paperclipai/db";
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

  return router;
}
