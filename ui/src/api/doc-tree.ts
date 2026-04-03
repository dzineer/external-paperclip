import { api } from "./client";

export interface DocFolder {
  id: string;
  companyId: string;
  parentId: string | null;
  name: string;
  path: string;
  ownerRole: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocFolderFile {
  id: string;
  folderId: string;
  assetId: string;
  displayName: string | null;
  sourceType: string;
  sourceRef: string | null;
  sortOrder: number;
  createdAt: string;
  contentType: string;
  byteSize: number;
  originalFilename: string | null;
}

export interface DocTree {
  folders: DocFolder[];
  files: DocFolderFile[];
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size: number | null;
  webViewLink: string;
  iconLink: string;
  owner: string | null;
}

export interface GoogleDriveResult {
  files: GoogleDriveFile[];
  nextPageToken: string | null;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description: string | null;
  start: string | null;
  end: string | null;
  location: string | null;
  status: string;
  htmlLink: string | null;
  colorId: string | null;
  creator: string | null;
  attendees: { email: string; displayName: string | null; responseStatus: string | null }[];
}

export interface CalendarEventsResult {
  events: CalendarEvent[];
}

export interface BrainFolder {
  folderId: string;
  folderName: string;
  folderPath: string;
  fileCount: number;
  trainedAt: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  from: string | null;
  to: string | null;
  subject: string | null;
  date: string | null;
  labelIds: string[];
  isUnread: boolean;
}

export interface GmailMessageFull extends GmailMessage {
  body: string;
}

export interface GmailListResult {
  messages: GmailMessage[];
}

export interface BrainStatus {
  trainedFolders: BrainFolder[];
  totalFolders: number;
  totalFiles: number;
  lastTrainedAt: string | null;
}

export const docTreeApi = {
  getTree: (companyId: string, search?: string, agentId?: string) => {
    const queryParts: string[] = [];
    if (search) queryParts.push(`search=${encodeURIComponent(search)}`);
    if (agentId) queryParts.push(`agentId=${encodeURIComponent(agentId)}`);
    const params = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
    return api.get<DocTree>(`/companies/${companyId}/doc-tree${params}`);
  },

  seedFolders: (companyId: string) =>
    api.post<{ seeded: boolean }>(`/companies/${companyId}/doc-tree/seed`, {}),

  createFolder: (companyId: string, parentId: string | null, name: string) =>
    api.post<DocFolder>(`/companies/${companyId}/doc-tree/folders`, { parentId, name }),

  renameFolder: (companyId: string, folderId: string, name: string) =>
    api.patch<DocFolder>(`/companies/${companyId}/doc-tree/folders/${folderId}`, { name }),

  deleteFolder: (companyId: string, folderId: string) =>
    api.delete<{ deleted: boolean }>(`/companies/${companyId}/doc-tree/folders/${folderId}`),

  uploadFile: async (companyId: string, folderId: string, file: File, displayName?: string, agentId?: string) => {
    const buffer = await file.arrayBuffer();
    const safeFile = new File([buffer], file.name, { type: file.type });
    const form = new FormData();
    form.append("file", safeFile);
    if (displayName) form.append("displayName", displayName);
    if (agentId) form.append("agentId", agentId);
    return api.postForm<DocFolderFile & { contentPath: string }>(
      `/companies/${companyId}/doc-tree/folders/${folderId}/upload`,
      form,
    );
  },

  importDrive: (companyId: string, folderId: string, driveFileId: string, fileName?: string) =>
    api.post<DocFolderFile & { contentPath: string }>(
      `/companies/${companyId}/doc-tree/folders/${folderId}/import-drive`,
      { driveFileId, fileName },
    ),

  moveFile: (companyId: string, fileId: string, folderId: string) =>
    api.patch<DocFolderFile>(`/companies/${companyId}/doc-tree/files/${fileId}`, { folderId }),

  renameFile: (companyId: string, fileId: string, displayName: string) =>
    api.patch<DocFolderFile>(`/companies/${companyId}/doc-tree/files/${fileId}`, { displayName }),

  removeFile: (companyId: string, fileId: string) =>
    api.delete<{ deleted: boolean }>(`/companies/${companyId}/doc-tree/files/${fileId}`),

  listGoogleDrive: (companyId: string, q?: string, pageToken?: string) => {
    const params: string[] = [];
    if (q) params.push(`q=${encodeURIComponent(q)}`);
    if (pageToken) params.push(`pageToken=${encodeURIComponent(pageToken)}`);
    const qs = params.length > 0 ? `?${params.join("&")}` : "";
    return api.get<GoogleDriveResult>(`/companies/${companyId}/doc-tree/google-drive${qs}`);
  },

  trainBrain: (companyId: string, agentId: string, driveFolderId: string, driveFolderName: string) =>
    api.post<{ trained: boolean; documentsIngested: number; totalFiles: number }>(
      `/companies/${companyId}/agents/${agentId}/train-brain`,
      { driveFolderId, driveFolderName },
    ),

  listDriveFolder: (companyId: string, folderId: string) =>
    api.get<{ files: { id: string; name: string; mimeType: string; isFolder: boolean; modifiedTime: string; size: number | null }[] }>(
      `/companies/${companyId}/doc-tree/google-drive/folder/${folderId}`,
    ),

  getBrainStatus: (companyId: string, agentId: string) =>
    api.get<BrainStatus>(`/companies/${companyId}/agents/${agentId}/brain-status`),

  queryBrain: (companyId: string, agentId: string, query: string, maxFacts?: number) =>
    api.post<unknown>(`/companies/${companyId}/agents/${agentId}/query-brain`, { query, maxFacts: maxFacts ?? 10 }),

  listCalendarEvents: (companyId: string, timeMin?: string, timeMax?: string) => {
    const params: string[] = [];
    if (timeMin) params.push(`timeMin=${encodeURIComponent(timeMin)}`);
    if (timeMax) params.push(`timeMax=${encodeURIComponent(timeMax)}`);
    const qs = params.length > 0 ? `?${params.join("&")}` : "";
    return api.get<CalendarEventsResult>(`/companies/${companyId}/doc-tree/google-calendar${qs}`);
  },

  listGmail: (companyId: string, q?: string, maxResults?: number) => {
    const params: string[] = [];
    if (q) params.push(`q=${encodeURIComponent(q)}`);
    if (maxResults) params.push(`maxResults=${maxResults}`);
    const qs = params.length > 0 ? `?${params.join("&")}` : "";
    return api.get<GmailListResult>(`/companies/${companyId}/doc-tree/gmail${qs}`);
  },

  getGmailMessage: (companyId: string, messageId: string) =>
    api.get<GmailMessageFull>(`/companies/${companyId}/doc-tree/gmail/${messageId}`),
};
