export interface TestFileInfo {
  name: string;
  size: number;
  createdAt: string;
  modifiedAt?: string;
  extension?: string;
}

export interface TestFileListResponse {
  directory?: string;
  count?: number;
  files: TestFileInfo[];
}

export interface TestFileContent {
  filename: string;
  content: string;
  size?: number;
  createdAt?: string;
  modifiedAt?: string;
}

export type UploadStatus = "idle" | "uploading" | "success" | "error";

export type ActivityCategory =
  | "upload"
  | "generated"
  | "error"
  | "view"
  | "download"
  | "copy"
  | "folder"
  | "pipeline";

export type ActivityStatus = "started" | "success" | "error" | "info";

export type ActivitySource = "Local" | "Google Drive" | "VM Server";

export interface ActivityEvent {
  id: string;
  category: ActivityCategory;
  status: ActivityStatus;
  source: ActivitySource;
  title: string;
  message?: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export type PipelineStatus = "Online" | "Syncing" | "Offline";

export interface DashboardKpis {
  totalGeneratedFiles: number;
  specCount: number;
  featureCount: number;
  otherCount: number;
  videosTriggeredToday: number;
  pipelineStatus: PipelineStatus;
  lastUpdated: string | null;
}
