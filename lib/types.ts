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
