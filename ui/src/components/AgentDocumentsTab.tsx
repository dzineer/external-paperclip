import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FolderTree,
  Upload,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FileImage,
  FileSpreadsheet,
  Trash2,
  Download,
  Search,
} from "lucide-react";
import { docTreeApi, type DocFolder, type DocFolderFile } from "../api/doc-tree";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "./EmptyState";
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

function FolderNode({
  node,
  expanded,
  onToggle,
  selectedFolderId,
  onSelectFolder,
  onDeleteFile,
  depth,
}: {
  node: TreeNode;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
  onDeleteFile: (fileId: string) => void;
  depth: number;
}) {
  const isOpen = expanded.has(node.folder.id);
  const isSelected = selectedFolderId === node.folder.id;
  const Chevron = isOpen ? ChevronDown : ChevronRight;
  const FolderIcon = isOpen ? FolderOpen : Folder;
  const hasContent = node.children.length > 0 || node.files.length > 0;

  if (!hasContent && !isOpen && depth > 0) {
    // Show empty folders but keep them clickable
  }

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
                <a
                  href={`/api/assets/${file.assetId}/content`}
                  download={name}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Download className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </a>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFile(file.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
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

export function AgentDocumentsTab({
  agentId,
  companyId,
}: {
  agentId: string;
  companyId: string;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const treeQuery = useQuery({
    queryKey: queryKeys.docTree(companyId, agentId),
    queryFn: () => docTreeApi.getTree(companyId, search || undefined, agentId),
    enabled: !!companyId,
  });

  // Seed company folders if none exist (agent docs live in the same folder structure)
  const seedMutation = useMutation({
    mutationFn: () => docTreeApi.seedFolders(companyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.docTree(companyId, agentId) }),
  });

  const uploadMutation = useMutation({
    mutationFn: ({ folderId, file }: { folderId: string; file: File }) =>
      docTreeApi.uploadFile(companyId, folderId, file, undefined, agentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.docTree(companyId, agentId) }),
  });

  const createFolderMutation = useMutation({
    mutationFn: ({ parentId, name }: { parentId: string | null; name: string }) =>
      docTreeApi.createFolder(companyId, parentId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.docTree(companyId, agentId) });
      setShowNewFolder(false);
      setNewFolderName("");
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileId: string) => docTreeApi.removeFile(companyId, fileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.docTree(companyId, agentId) }),
  });

  // Seed if no folders
  useEffect(() => {
    if (treeQuery.data && treeQuery.data.folders.length === 0 && !seedMutation.isPending) {
      seedMutation.mutate();
    }
  }, [treeQuery.data]);

  const tree = useMemo(() => {
    if (!treeQuery.data) return [];
    return buildTree(treeQuery.data.folders, treeQuery.data.files);
  }, [treeQuery.data]);

  // Auto-expand root folders
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

  const totalFiles = treeQuery.data?.files.length ?? 0;

  if (treeQuery.isLoading || seedMutation.isPending) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading documents...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agent documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">{totalFiles} file{totalFiles !== 1 ? "s" : ""}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowNewFolder(true)}
          disabled={!selectedFolderId}
        >
          <FolderPlus className="h-3.5 w-3.5 mr-1" />
          Folder
        </Button>
        <Button
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={!selectedFolderId}
        >
          <Upload className="h-3.5 w-3.5 mr-1" />
          Upload
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
          Select a folder to upload documents for this agent.
        </p>
      )}

      {uploadMutation.isPending && (
        <p className="text-xs text-muted-foreground">Uploading...</p>
      )}

      {treeQuery.error && (
        <p className="text-sm text-destructive">
          {treeQuery.error instanceof Error ? treeQuery.error.message : "Failed to load documents"}
        </p>
      )}

      {/* Tree */}
      {tree.length > 0 && (
        <div className="border border-border rounded-lg bg-card">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Agent Documents
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
                onDeleteFile={(fileId) => deleteFileMutation.mutate(fileId)}
                depth={0}
              />
            ))}
          </div>
        </div>
      )}

      {tree.length === 0 && totalFiles === 0 && !treeQuery.isLoading && (
        <EmptyState icon={FolderTree} message="No documents for this agent yet. Upload a file to get started." />
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
    </div>
  );
}
