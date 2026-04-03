import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  BookOpen,
  Shield,
  FolderArchive,
  FileText,
  FileImage,
  FileSpreadsheet,
  BarChart3,
  Mail,
  ClipboardList,
  Search,
  Filter,
  TrendingUp,
  ExternalLink,
  HardDrive,
  Activity,
  Database,
  Zap,
  CheckCircle,
  Folder,
  FolderOpen,
  Loader2,
  ChevronRight,
  ChevronDown,
  CloudDownload,
  Send,
  MessageSquare,
} from "lucide-react";
import { docTreeApi, type DocFolder, type DocFolderFile, type GoogleDriveFile } from "../api/doc-tree";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownBody } from "./MarkdownBody";
import { queryKeys } from "../lib/queryKeys";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function relTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fileTypeLabel(contentType: string) {
  if (contentType.includes("pdf")) return "PDF";
  if (contentType.includes("markdown") || contentType.includes("md")) return "REPORT";
  if (contentType.includes("json")) return "DATA";
  if (contentType.includes("csv") || contentType.includes("spreadsheet")) return "DATA";
  if (contentType.includes("image")) return "IMAGE";
  if (contentType.includes("html")) return "WEB";
  if (contentType.includes("text")) return "NOTE";
  return "FILE";
}

function fileIcon(contentType: string) {
  if (contentType.startsWith("image/")) return FileImage;
  if (contentType.includes("spreadsheet") || contentType === "text/csv") return FileSpreadsheet;
  if (contentType.includes("mail")) return Mail;
  return FileText;
}

// Knowledge Vault card icons mapped to folder ownerRole
const VAULT_CARDS: Record<string, { icon: typeof BookOpen; label: string; description: string }> = {
  all: { icon: FolderArchive, label: "Paperclip Root", description: "Core shared documents and fundamental directives." },
  shared: { icon: Brain, label: "Brain", description: "Your personal knowledge brain. Click to train on document folders." },
  ceo: { icon: Shield, label: "Strategy & Governance", description: "Vision papers, executive summaries, and strategic directives." },
  research_specialist: { icon: BarChart3, label: "Research Vault", description: "Primary sources, tech audits, competitive intelligence." },
  executive_assistant: { icon: ClipboardList, label: "Operations & Execution", description: "Schedules, meeting minutes, resource directories." },
};

export function AgentBrainTab({
  agentId,
  agentName,
  agentTitle,
  companyId,
}: {
  agentId: string;
  agentName: string;
  agentTitle?: string;
  companyId: string;
}) {
  const queryClient = useQueryClient();
  const [memorySearch, setMemorySearch] = useState("");
  const [brainQuery, setBrainQuery] = useState("");
  const [brainResult, setBrainResult] = useState<Record<string, unknown> | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [selectedDriveFolder, setSelectedDriveFolder] = useState<{ id: string; name: string } | null>(null);
  // Start inside Paperclip Root on Google Drive
  const PAPERCLIP_ROOT_DRIVE = { id: "1IQ_JH0XYUqeUC7EiWIo4mxOb-3vbY1NE", name: "Paperclip Root" };
  const [driveNavStack, setDriveNavStack] = useState<{ id: string; name: string }[]>([PAPERCLIP_ROOT_DRIVE]);

  // Fetch agent's documents (filtered by role)
  const treeQuery = useQuery({
    queryKey: queryKeys.docTree(companyId, agentId),
    queryFn: () => docTreeApi.getTree(companyId, undefined, agentId),
    enabled: !!companyId,
  });

  // Fetch brain training status
  const brainStatusQuery = useQuery({
    queryKey: ["brain-status", companyId, agentId],
    queryFn: () => docTreeApi.getBrainStatus(companyId, agentId),
    enabled: !!companyId,
  });

  // Train brain mutation
  const trainMutation = useMutation({
    mutationFn: ({ driveFolderId, driveFolderName }: { driveFolderId: string; driveFolderName: string }) =>
      docTreeApi.trainBrain(companyId, agentId, driveFolderId, driveFolderName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brain-status", companyId, agentId] });
      setShowFolderPicker(false);
      setSelectedDriveFolder(null);
      setDriveNavStack([PAPERCLIP_ROOT_DRIVE]);
    },
  });

  // Query brain mutation
  const queryBrainMutation = useMutation({
    mutationFn: (query: string) => docTreeApi.queryBrain(companyId, agentId, query, 10),
    onSuccess: (data) => { setBrainResult(data as Record<string, unknown>); setBrainQuery(""); },
    onError: (err) => setBrainResult({ error: (err as Error).message }),
  });

  // Current Drive folder being browsed (always starts at Paperclip Root)
  const currentDriveFolderId = driveNavStack[driveNavStack.length - 1]?.id ?? PAPERCLIP_ROOT_DRIVE.id;

  const driveFolderQuery = useQuery({
    queryKey: ["drive-folder-browse", companyId, currentDriveFolderId],
    queryFn: () => docTreeApi.listDriveFolder(companyId, currentDriveFolderId),
    enabled: !!companyId && showFolderPicker,
    retry: false,
  });

  // Fetch Google Drive files
  const driveQuery = useQuery({
    queryKey: ["google-drive", companyId, "brain"],
    queryFn: () => docTreeApi.listGoogleDrive(companyId),
    enabled: !!companyId,
    retry: false,
  });

  // Group folders by root ownerRole for vault cards
  const vaultCards = useMemo(() => {
    if (!treeQuery.data) return [];
    const rootFolders = treeQuery.data.folders.filter((f) => f.parentId === null);
    const allFiles = treeQuery.data.files;

    return rootFolders.map((folder) => {
      const childIds = new Set(
        treeQuery.data!.folders
          .filter((f) => f.parentId === folder.id)
          .map((f) => f.id),
      );
      childIds.add(folder.id);
      const fileCount = allFiles.filter((f) => childIds.has(f.folderId)).length;
      const card = VAULT_CARDS[folder.ownerRole ?? "shared"] ?? VAULT_CARDS.shared;

      return {
        id: folder.id,
        icon: card.icon,
        label: card.label,
        name: folder.name.replace(/_/g, " "),
        description: card.description,
        fileCount,
        ownerRole: folder.ownerRole,
      };
    });
  }, [treeQuery.data]);

  // All agent files for the memory table
  const memoryFiles = useMemo(() => {
    if (!treeQuery.data) return [];
    let files = treeQuery.data.files;
    if (memorySearch) {
      const q = memorySearch.toLowerCase();
      files = files.filter(
        (f) =>
          (f.displayName ?? f.originalFilename ?? "").toLowerCase().includes(q),
      );
    }
    return files.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [treeQuery.data, memorySearch]);

  // Metrics
  const totalBytes = useMemo(
    () => (treeQuery.data?.files ?? []).reduce((sum, f) => sum + f.byteSize, 0),
    [treeQuery.data],
  );
  const totalFiles = treeQuery.data?.files.length ?? 0;
  const driveFiles = driveQuery.data?.files.length ?? 0;

  return (
    <div className="flex flex-col gap-8">
      {/* Agent Header */}
      <section className="flex justify-between items-end">
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-sm bg-card border border-border overflow-hidden flex items-center justify-center">
              <Brain className="h-10 w-10 text-primary/60" />
            </div>
            <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 bg-primary rounded-full border-[3px] border-background flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-primary-foreground rounded-full animate-pulse" />
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground mb-0.5">
              {agentName}'s Knowledge Brain
            </h2>
            <p className="text-sm font-medium text-muted-foreground">
              {agentTitle ?? agentName}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-1">
            <div className="h-1 w-8 bg-primary rounded-full" />
            <div className="h-1 w-8 bg-primary/20 rounded-full" />
            <div className="h-1 w-8 bg-primary/20 rounded-full" />
          </div>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            System Synced
          </span>
        </div>
      </section>

      {/* Brain Training Folder */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <h3 className="text-base font-bold text-foreground">{agentName}'s Brain</h3>
          <span className="px-2 py-0.5 bg-card text-[10px] font-bold text-primary border border-border rounded-sm">
            KNOWLEDGE GRAPH
          </span>
        </div>

        {brainStatusQuery.data && brainStatusQuery.data.trainedFolders.length > 0 ? (
          // Trained — show the selected brain folder
          <div
            onClick={() => setShowFolderPicker(true)}
            className="group bg-card p-6 border border-primary/30 rounded-sm cursor-pointer hover:border-primary/50 transition-all"
          >
            <div className="flex justify-between items-start mb-4">
              <Brain className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-primary" />
                <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Trained</span>
              </div>
            </div>
            <h4 className="text-xl font-bold text-foreground mb-1">
              {brainStatusQuery.data.trainedFolders[0].folderName.replace(/_/g, " ")}
            </h4>
            <p className="text-xs text-muted-foreground mb-4">
              {brainStatusQuery.data.trainedFolders[0].folderPath}
            </p>
            <div className="flex items-center gap-6">
              <span className="text-[10px] uppercase font-bold text-primary">
                {brainStatusQuery.data.totalFiles} documents ingested
              </span>
              <span className="text-[10px] text-muted-foreground">
                Last trained: {new Date(brainStatusQuery.data.trainedFolders[0].trainedAt).toLocaleDateString()}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-3">Click to change or retrain</p>
          </div>
        ) : (
          // Not trained — show prompt to select folder
          <div
            onClick={() => setShowFolderPicker(true)}
            className="group bg-card p-6 border border-dashed border-border rounded-sm cursor-pointer hover:border-primary/40 transition-all text-center"
          >
            <Brain className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3 group-hover:text-primary/60 transition-colors" />
            <h4 className="text-lg font-bold text-foreground mb-1">No Brain Folder Selected</h4>
            <p className="text-xs text-muted-foreground mb-4">
              Select a folder from Paperclip Root to train {agentName}'s knowledge brain.
              All documents in the folder will be ingested into the knowledge graph.
            </p>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary">
              <Zap className="h-3.5 w-3.5" />
              Click to select brain folder
            </span>
          </div>
        )}
      </section>

      {/* Test Brain — Query Verification */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <h3 className="text-base font-bold text-foreground">Test Brain</h3>
          <span className="px-2 py-0.5 bg-card text-[10px] font-bold text-muted-foreground border border-border rounded-sm">
            RAG VERIFICATION
          </span>
        </div>

        <div className="flex flex-col gap-3">
          <div className="relative">
            <Textarea
              placeholder={`Ask ${agentName}'s brain a question to verify RAG is working...`}
              value={brainQuery}
              onChange={(e) => { setBrainQuery(e.target.value); setBrainResult(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && brainQuery.trim()) {
                  e.preventDefault();
                  queryBrainMutation.mutate(brainQuery.trim());
                }
              }}
              className="min-h-[80px] resize-none pr-14 text-sm"
            />
            <Button
              size="sm"
              onClick={() => brainQuery.trim() && queryBrainMutation.mutate(brainQuery.trim())}
              disabled={!brainQuery.trim() || queryBrainMutation.isPending}
              className="absolute right-2 bottom-2"
            >
              {queryBrainMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Results */}
          {queryBrainMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
              <Loader2 className="h-4 w-4 animate-spin" />
              Asking {agentName}...
            </div>
          )}

          {brainResult && !queryBrainMutation.isPending && (
            <div className="bg-card border border-border rounded-sm p-5">
              {typeof (brainResult as Record<string, unknown>)?.answer === "string" ? (
                <MarkdownBody className="text-sm">
                  {String((brainResult as Record<string, unknown>).answer)}
                </MarkdownBody>
              ) : (brainResult as Record<string, unknown>)?.error ? (
                <p className="text-sm text-destructive">
                  {String((brainResult as Record<string, unknown>).error)}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No answer found. {!brainStatusQuery.data?.totalFolders ? "Brain has not been trained yet." : "Try rephrasing your question."}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Agent Memory - Table */}
      <section className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-foreground">{agentName}'s Memory</h3>
            <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">
              History of Work
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
              <Input
                placeholder="Search memory..."
                value={memorySearch}
                onChange={(e) => setMemorySearch(e.target.value)}
                className="pl-8 h-8 text-xs w-52"
              />
            </div>
          </div>
        </div>

        <div className="bg-card overflow-hidden flex flex-col border border-border rounded-sm">
          {/* Table header */}
          <div className="grid grid-cols-12 px-5 py-3 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/30">
            <div className="col-span-5">Document Name</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-2">Source</div>
            <div className="col-span-2 text-right">Size</div>
            <div className="col-span-1 text-right">Modified</div>
          </div>

          {/* Table body */}
          <div className="overflow-y-auto max-h-80">
            {memoryFiles.length === 0 && (
              <div className="px-5 py-8 text-center text-xs text-muted-foreground">
                {treeQuery.isLoading ? "Loading..." : "No documents in memory yet."}
              </div>
            )}

            {memoryFiles.map((file) => {
              const name = file.displayName || file.originalFilename || "Untitled";
              const Icon = fileIcon(file.contentType);
              const typeLabel = fileTypeLabel(file.contentType);

              return (
                <a
                  key={file.id}
                  href={`/api/assets/${file.assetId}/content`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid grid-cols-12 px-5 py-3.5 items-center hover:bg-accent/40 transition-colors cursor-pointer group"
                >
                  <div className="col-span-5 flex items-center gap-3">
                    <div className="w-7 h-7 flex items-center justify-center bg-muted text-primary rounded-sm shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                      {name}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[10px] px-2 py-0.5 border border-border rounded-full text-muted-foreground">
                      {typeLabel}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[11px] text-muted-foreground">
                      {file.sourceType === "google_drive" ? "Google Drive" : "Upload"}
                    </span>
                  </div>
                  <div className="col-span-2 text-right text-[11px] text-muted-foreground font-mono">
                    {formatBytes(file.byteSize)}
                  </div>
                  <div className="col-span-1 text-right text-[11px] text-muted-foreground">
                    {relTime(file.createdAt)}
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* Metrics */}
      <section className="grid grid-cols-3 gap-8 pt-5 border-t border-border">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
            Total Intelligence Managed
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-foreground">
              {totalBytes >= 1073741824
                ? (totalBytes / 1073741824).toFixed(1)
                : totalBytes >= 1048576
                  ? (totalBytes / 1048576).toFixed(1)
                  : (totalBytes / 1024).toFixed(1)}
            </span>
            <span className="text-sm font-bold text-primary">
              {totalBytes >= 1073741824 ? "GB" : totalBytes >= 1048576 ? "MB" : "KB"}
            </span>
          </div>
          <div className="w-full h-1 bg-muted mt-2 rounded-full">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${Math.min(100, (totalBytes / (100 * 1048576)) * 100)}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
            Documents Stored
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-foreground">{totalFiles}</span>
            <span className="text-sm font-bold text-primary">files</span>
          </div>
          <div className="flex gap-1 mt-2">
            {Array.from({ length: Math.min(5, totalFiles) }, (_, i) => (
              <div key={i} className="w-1 h-3 bg-primary rounded-sm" />
            ))}
            {Array.from({ length: Math.max(0, 5 - totalFiles) }, (_, i) => (
              <div key={i} className="w-1 h-3 bg-primary/20 rounded-sm" />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
            Brain Status
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-foreground">
              {brainStatusQuery.data?.totalFolders ?? 0}
            </span>
            <span className="text-xs font-medium text-muted-foreground/60 ml-1">
              {(brainStatusQuery.data?.totalFolders ?? 0) === 1 ? "folder trained" : "folders trained"}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-2">
            {brainStatusQuery.data?.totalFolders ? (
              <>
                <CheckCircle className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] text-primary uppercase font-bold tracking-tighter">Trained</span>
              </>
            ) : (
              <>
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">Not trained</span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Google Drive Folder Picker for Brain Training */}
      <Dialog open={showFolderPicker} onOpenChange={(open) => {
        setShowFolderPicker(open);
        if (!open) { setDriveNavStack([PAPERCLIP_ROOT_DRIVE]); setSelectedDriveFolder(null); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Train {agentName}'s Brain</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mb-2">
            Navigate Google Drive to find the folder. All documents inside will be ingested into {agentName}'s knowledge graph.
          </p>

          {/* Breadcrumb navigation */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3 flex-wrap">
            {driveNavStack.map((crumb, i) => (
              <span key={crumb.id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" />}
                <button
                  onClick={() => {
                    setDriveNavStack((prev) => prev.slice(0, i + 1));
                    setSelectedDriveFolder(null);
                  }}
                  className={`hover:text-primary font-medium ${i === driveNavStack.length - 1 ? "text-foreground" : ""}`}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>

          {/* Folder contents */}
          <div className="max-h-64 overflow-y-auto border border-border rounded-sm">
            {driveFolderQuery.isLoading && (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                Loading...
              </div>
            )}
            {driveFolderQuery.error && (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                Google Drive not connected
              </div>
            )}
            {driveFolderQuery.data && driveFolderQuery.data.files.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                Empty folder
              </div>
            )}
            {driveFolderQuery.data?.files.map((file) => {
              const isSelected = selectedDriveFolder?.id === file.id;
              return (
                <div
                  key={file.id}
                  onClick={() => {
                    if (file.isFolder) {
                      setSelectedDriveFolder({ id: file.id, name: file.name });
                    }
                  }}
                  onDoubleClick={() => {
                    if (file.isFolder) {
                      setDriveNavStack((prev) => [...prev, { id: file.id, name: file.name }]);
                      setSelectedDriveFolder(null);
                    }
                  }}
                  className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                    isSelected ? "bg-primary/10" : "hover:bg-accent/50"
                  } ${!file.isFolder ? "opacity-40" : ""}`}
                >
                  {file.isFolder ? (
                    <Folder className={`h-4 w-4 shrink-0 ${isSelected ? "text-primary" : "text-amber-500"}`} />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-sm text-foreground flex-1 truncate">{file.name}</span>
                  {file.isFolder && (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          {selectedDriveFolder && (
            <p className="text-xs text-primary font-medium">
              Selected: {selectedDriveFolder.name} — double-click to enter, or click "Train" to use this folder
            </p>
          )}

          {trainMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Training... Reading and ingesting documents from Google Drive
            </div>
          )}
          {trainMutation.isSuccess && (
            <p className="text-sm text-primary">
              Training complete! {trainMutation.data?.documentsIngested} documents ingested.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFolderPicker(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedDriveFolder && trainMutation.mutate({
                driveFolderId: selectedDriveFolder.id,
                driveFolderName: selectedDriveFolder.name,
              })}
              disabled={!selectedDriveFolder || trainMutation.isPending}
            >
              {trainMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Training...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-1.5" />
                  Train on Folder
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
