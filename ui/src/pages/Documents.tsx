import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FolderTree,
  Upload,
  FolderPlus,
  CloudDownload,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FileImage,
  FileSpreadsheet,
  Trash2,
  Pencil,
  ArrowRight,
  Download,
  Search,
} from "lucide-react";
import { docTreeApi, type DocFolder, type DocFolderFile, type GoogleDriveFile } from "../api/doc-tree";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

function fileIcon(contentType: string) {
  if (contentType.startsWith("image/")) return FileImage;
  if (contentType.includes("spreadsheet") || contentType === "text/csv") return FileSpreadsheet;
  return FileText;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface TreeNode {
  folder: DocFolder;
  children: TreeNode[];
  files: DocFolderFile[];
}

function buildTree(folders: DocFolder[], files: DocFolderFile[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const f of folders) {
    map.set(f.id, { folder: f, children: [], files: [] });
  }
  for (const file of files) {
    map.get(file.folderId)?.files.push(file);
  }
  const roots: TreeNode[] = [];
  for (const node of map.values()) {
    if (node.folder.parentId && map.has(node.folder.parentId)) {
      map.get(node.folder.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.folder.sortOrder - b.folder.sortOrder || a.folder.name.localeCompare(b.folder.name));
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

function ownerLabel(role: string | null) {
  if (!role) return null;
  const labels: Record<string, string> = {
    ceo: "CEO Owned",
    research_specialist: "Research Specialist Owned",
    executive_assistant: "Executive Assistant Owned",
    shared: "Shared/Wiki",
  };
  return labels[role] ?? role;
}

function FolderNode({
  node,
  expanded,
  onToggle,
  selectedFolderId,
  onSelectFolder,
  onUpload,
  onDeleteFile,
  depth,
}: {
  node: TreeNode;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
  onUpload: (folderId: string) => void;
  onDeleteFile: (fileId: string) => void;
  depth: number;
}) {
  const isOpen = expanded.has(node.folder.id);
  const isSelected = selectedFolderId === node.folder.id;
  const Chevron = isOpen ? ChevronDown : ChevronRight;
  const FolderIcon = isOpen ? FolderOpen : Folder;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-1.5 px-2 cursor-pointer hover:bg-accent/50 rounded-sm transition-colors ${
          isSelected ? "bg-accent" : ""
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          onToggle(node.folder.id);
          onSelectFolder(node.folder.id);
        }}
      >
        <Chevron className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <FolderIcon className="h-4 w-4 shrink-0 text-amber-500" />
        <span className="text-sm truncate flex-1">{node.folder.name.replace(/_/g, " ")}</span>
        {depth === 0 && node.folder.ownerRole && (
          <span className="text-[11px] text-muted-foreground shrink-0">
            {ownerLabel(node.folder.ownerRole)}
          </span>
        )}
      </div>

      {isOpen && (
        <div>
          {node.children.map((child) => (
            <FolderNode
              key={child.folder.id}
              node={child}
              expanded={expanded}
              onToggle={onToggle}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
              onUpload={onUpload}
              onDeleteFile={onDeleteFile}
              depth={depth + 1}
            />
          ))}

          {node.files.map((file) => {
            const Icon = fileIcon(file.contentType);
            const name = file.displayName || file.originalFilename || "Untitled";
            return (
              <div
                key={file.id}
                className="flex items-center gap-1.5 py-1.5 px-2 hover:bg-accent/50 rounded-sm group"
                style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
              >
                <div className="w-3.5" />
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <a
                  href={`/api/assets/${file.assetId}/content`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm truncate flex-1 hover:underline"
                >
                  {name}
                </a>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {formatBytes(file.byteSize)}
                </span>
                {file.sourceType === "google_drive" && (
                  <span title="Imported from Google Drive">
                  <CloudDownload className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </span>
                )}
                <a
                  href={`/api/assets/${file.assetId}/content`}
                  download={name}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </a>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFile(file.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            );
          })}

          {node.children.length === 0 && node.files.length === 0 && (
            <div
              className="text-[11px] text-muted-foreground py-1.5 px-2 italic"
              style={{ paddingLeft: `${(depth + 1) * 16 + 24}px` }}
            >
              Empty folder
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Documents() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showDriveImport, setShowDriveImport] = useState(false);
  const [driveFileId, setDriveFileId] = useState("");
  const [driveFileName, setDriveFileName] = useState("");
  const [driveSearch, setDriveSearch] = useState("");
  const [driveCollapsed, setDriveCollapsed] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Documents" }]);
  }, [setBreadcrumbs]);

  const treeQuery = useQuery({
    queryKey: queryKeys.docTree(selectedCompanyId!),
    queryFn: () => docTreeApi.getTree(selectedCompanyId!, search || undefined),
    enabled: !!selectedCompanyId,
  });

  const seedMutation = useMutation({
    mutationFn: () => docTreeApi.seedFolders(selectedCompanyId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.docTree(selectedCompanyId!) }),
  });

  const uploadMutation = useMutation({
    mutationFn: ({ folderId, file }: { folderId: string; file: File }) =>
      docTreeApi.uploadFile(selectedCompanyId!, folderId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.docTree(selectedCompanyId!) }),
  });

  const createFolderMutation = useMutation({
    mutationFn: ({ parentId, name }: { parentId: string | null; name: string }) =>
      docTreeApi.createFolder(selectedCompanyId!, parentId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.docTree(selectedCompanyId!) });
      setShowNewFolder(false);
      setNewFolderName("");
    },
  });

  const importDriveMutation = useMutation({
    mutationFn: ({ folderId, driveFileId, fileName }: { folderId: string; driveFileId: string; fileName?: string }) =>
      docTreeApi.importDrive(selectedCompanyId!, folderId, driveFileId, fileName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.docTree(selectedCompanyId!) });
      setShowDriveImport(false);
      setDriveFileId("");
      setDriveFileName("");
    },
  });

  const driveQuery = useQuery({
    queryKey: ["google-drive", selectedCompanyId, driveSearch],
    queryFn: () => docTreeApi.listGoogleDrive(selectedCompanyId!, driveSearch || undefined),
    enabled: !!selectedCompanyId,
    retry: false,
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileId: string) => docTreeApi.removeFile(selectedCompanyId!, fileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.docTree(selectedCompanyId!) }),
  });

  // Auto-seed on first load if no folders
  useEffect(() => {
    if (treeQuery.data && treeQuery.data.folders.length === 0 && !seedMutation.isPending) {
      seedMutation.mutate();
    }
  }, [treeQuery.data]);

  const tree = useMemo(() => {
    if (!treeQuery.data) return [];
    // Company Documents page only shows Paperclip Root and its contents
    const rootFolder = treeQuery.data.folders.find((f) => f.parentId === null && f.ownerRole === "all");
    if (!rootFolder) return buildTree(treeQuery.data.folders, treeQuery.data.files);
    const rootId = rootFolder.id;
    const filteredFolders = treeQuery.data.folders.filter((f) => f.id === rootId || f.parentId === rootId);
    const folderIds = new Set(filteredFolders.map((f) => f.id));
    const filteredFiles = treeQuery.data.files.filter((f) => folderIds.has(f.folderId));
    return buildTree(filteredFolders, filteredFiles);
  }, [treeQuery.data]);

  // Auto-expand root folders on first load
  useEffect(() => {
    if (tree.length > 0 && expanded.size === 0) {
      setExpanded(new Set(tree.map((n) => n.folder.id)));
    }
  }, [tree]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedFolderId) return;
    uploadMutation.mutate({ folderId: selectedFolderId, file });
    e.target.value = "";
  }

  if (!selectedCompanyId) {
    return <EmptyState icon={FolderTree} message="Select a company to view documents." />;
  }

  if (treeQuery.isLoading || seedMutation.isPending) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowNewFolder(true)}
          disabled={!selectedFolderId}
        >
          <FolderPlus className="h-4 w-4 mr-1.5" />
          New Folder
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDriveImport(true)}
          disabled={!selectedFolderId}
        >
          <CloudDownload className="h-4 w-4 mr-1.5" />
          Import from Drive
        </Button>
        <Button
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={!selectedFolderId}
        >
          <Upload className="h-4 w-4 mr-1.5" />
          Upload File
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>

      {!selectedFolderId && tree.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Select a folder to upload files, create subfolders, or import from Google Drive.
        </p>
      )}

      {/* Error */}
      {treeQuery.error && (
        <p className="text-sm text-destructive">
          {treeQuery.error instanceof Error ? treeQuery.error.message : "Failed to load document tree"}
        </p>
      )}

      {uploadMutation.isPending && (
        <p className="text-xs text-muted-foreground">Uploading...</p>
      )}
      {importDriveMutation.isPending && (
        <p className="text-xs text-muted-foreground">Importing from Google Drive...</p>
      )}

      {/* Google Drive */}
      <div className="border border-border rounded-lg bg-card">
        <div
          className="px-3 py-2 border-b border-border flex items-center gap-2 cursor-pointer"
          onClick={() => setDriveCollapsed(!driveCollapsed)}
        >
          {driveCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <CloudDownload className="h-4 w-4 text-blue-500" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex-1">
            Google Drive
          </span>
          {!driveCollapsed && (
            <div className="relative max-w-48">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Search Drive..."
                value={driveSearch}
                onChange={(e) => { e.stopPropagation(); setDriveSearch(e.target.value); }}
                onClick={(e) => e.stopPropagation()}
                className="pl-7 h-7 text-xs"
              />
            </div>
          )}
        </div>
        {!driveCollapsed && (
          <div className="py-1 max-h-64 overflow-y-auto">
            {driveQuery.isLoading && (
              <div className="px-4 py-3 text-xs text-muted-foreground">Loading Google Drive files...</div>
            )}
            {driveQuery.error && (
              <div className="px-4 py-3 text-xs text-muted-foreground">
                {(driveQuery.error as Error).message?.includes("401") || (driveQuery.error as Error).message?.includes("auth")
                  ? "Google Drive not connected. Authentication required."
                  : `Unable to load Google Drive: ${(driveQuery.error as Error).message}`}
              </div>
            )}
            {driveQuery.data && driveQuery.data.files.length === 0 && (
              <div className="px-4 py-3 text-xs text-muted-foreground">No files found in Google Drive.</div>
            )}
            {driveQuery.data && driveQuery.data.files.map((file) => {
              const isFolder = file.mimeType === "application/vnd.google-apps.folder";
              const Icon = isFolder ? Folder : file.mimeType.startsWith("image/") ? FileImage : FileText;
              return (
                <div
                  key={file.id}
                  className="flex items-center gap-2 py-1.5 px-4 hover:bg-accent/50 rounded-sm group"
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isFolder ? "text-amber-500" : "text-blue-400"}`} />
                  <a
                    href={file.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm truncate flex-1 hover:underline"
                  >
                    {file.name}
                  </a>
                  {file.size && (
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {formatBytes(file.size)}
                    </span>
                  )}
                  {file.owner && (
                    <span className="text-[11px] text-muted-foreground shrink-0 max-w-20 truncate">
                      {file.owner}
                    </span>
                  )}
                  {!isFolder && selectedFolderId && (
                    <button
                      onClick={() => {
                        setDriveFileId(file.id);
                        setDriveFileName(file.name);
                        setShowDriveImport(true);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-blue-500 hover:text-blue-700 shrink-0"
                    >
                      Import
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tree */}
      {tree.length > 0 && (
        <div className="border border-border rounded-lg bg-card">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Document Library
            </span>
          </div>
          <div className="py-1">
            {tree.map((node) => (
              <FolderNode
                key={node.folder.id}
                node={node}
                expanded={expanded}
                onToggle={toggleExpanded}
                selectedFolderId={selectedFolderId}
                onSelectFolder={setSelectedFolderId}
                onUpload={(folderId) => {
                  setSelectedFolderId(folderId);
                  fileInputRef.current?.click();
                }}
                onDeleteFile={(fileId) => deleteFileMutation.mutate(fileId)}
                depth={0}
              />
            ))}
          </div>
        </div>
      )}

      {tree.length === 0 && !treeQuery.isLoading && !seedMutation.isPending && (
        <EmptyState icon={FolderTree} message="No documents yet. Setting up default folder structure..." />
      )}

      {/* New Folder Dialog */}
      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newFolderName.trim()) {
                createFolderMutation.mutate({ parentId: selectedFolderId, name: newFolderName.trim() });
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFolder(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createFolderMutation.mutate({ parentId: selectedFolderId, name: newFolderName.trim() })}
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Google Drive Import Dialog */}
      <Dialog open={showDriveImport} onOpenChange={setShowDriveImport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import from Google Drive</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Google Drive File ID</label>
              <Input
                placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                value={driveFileId}
                onChange={(e) => setDriveFileId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Found in the file's URL: drive.google.com/file/d/<strong>FILE_ID</strong>/view
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">File Name (optional)</label>
              <Input
                placeholder="document.pdf"
                value={driveFileName}
                onChange={(e) => setDriveFileName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDriveImport(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                importDriveMutation.mutate({
                  folderId: selectedFolderId!,
                  driveFileId: driveFileId.trim(),
                  fileName: driveFileName.trim() || undefined,
                })
              }
              disabled={!driveFileId.trim() || !selectedFolderId || importDriveMutation.isPending}
            >
              {importDriveMutation.isPending ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
