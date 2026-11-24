"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { formatBytes } from "@/lib/format";
import type { UploadStatus } from "@/lib/types";

const UPLOAD_ENDPOINT = process.env.NEXT_PUBLIC_UPLOAD_ENDPOINT ?? "";
const FIELD_NAME = process.env.NEXT_PUBLIC_UPLOAD_FIELD_NAME || "file";
const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || 500);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

const ALLOWED_EXTENSIONS = [".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v", ".mpeg", ".mpg", ".ogv", ".3gp"];
const ACCEPT = ["video/*", ...ALLOWED_EXTENSIONS].join(",");
const FOLDER_WEBHOOK = "https://ai-automation-stage.oomnieye.com/webhook/get_folder_name";
const FILES_WEBHOOK = "https://ai-automation-stage.oomnieye.com/webhook/Get_file";
const FILE_FETCH_WEBHOOK = "https://ai-automation-stage.oomnieye.com/webhook/file_fetch";

interface VideoUploaderProps {
  /** Called after the endpoint accepts the upload. */
  onUploaded?: (file: File | null, response: unknown) => void;
}

interface DriveItem {
  id: string;
  name: string;
}

function getExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function validateFile(file: File): string | null {
  const ext = getExtension(file.name);
  const isVideo = file.type.startsWith("video/") || ALLOWED_EXTENSIONS.includes(ext);
  if (!isVideo) return `"${file.name}" is not a supported video. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`;
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_UPLOAD_BYTES) {
    return `"${file.name}" is ${formatBytes(file.size)}; the limit is ${MAX_UPLOAD_MB} MB.`;
  }
  return null;
}

function messageFromResponse(xhr: XMLHttpRequest): { data: unknown; message: string | null } {
  const text = xhr.responseText ?? "";
  try {
    const data: unknown = text ? JSON.parse(text) : null;
    if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      const msg = d.message ?? d.error ?? d.status;
      return { data, message: typeof msg === "string" ? msg : null };
    }
    return { data, message: null };
  } catch {
    return { data: text, message: text && !text.trim().startsWith("<") ? text.slice(0, 200) : null };
  }
}

export default function VideoUploader({ onUploaded }: VideoUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [folders, setFolders] = useState<DriveItem[]>([]);
  const [files, setFiles] = useState<DriveItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<DriveItem | null>(null);
  const [selectedDriveFile, setSelectedDriveFile] = useState<DriveItem | null>(null);
  const [folderLoading, setFolderLoading] = useState(true);
  const [fileLoading, setFileLoading] = useState(false);
  const [driveMessage, setDriveMessage] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const dragDepth = useRef(0);

  useEffect(() => () => xhrRef.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();

    const loadFolders = async () => {
      setFolderLoading(true);
      setDriveMessage(null);
      try {
        const response = await fetch(FOLDER_WEBHOOK, {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        if (!response.ok) throw new Error(`Folders webhook returned HTTP ${response.status}`);
        const data: unknown = await response.json();
        if (!Array.isArray(data)) throw new Error("Folders webhook did not return a list.");
        setFolders(
          data.filter(
            (item): item is DriveItem =>
              typeof item === "object" &&
              item !== null &&
              typeof (item as Record<string, unknown>).id === "string" &&
              typeof (item as Record<string, unknown>).name === "string",
          ),
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFolders([]);
        setDriveMessage(error instanceof Error ? error.message : "Could not load Google Drive folders.");
      } finally {
        if (!controller.signal.aborted) setFolderLoading(false);
      }
    };

    void loadFolders();
    return () => controller.abort();
  }, []);

  const selectFolder = async (folderId: string) => {
    const folder = folders.find((item) => item.id === folderId) ?? null;
    setSelectedFolder(folder);
    setSelectedDriveFile(null);
    setFiles([]);
    setDriveMessage(null);
    if (!folder) return;

    setFileLoading(true);
    try {
      const response = await fetch(FILES_WEBHOOK, {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: folder.id, name: folder.name }),
      });
      if (!response.ok) throw new Error(`Files webhook returned HTTP ${response.status}`);
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error("Files webhook did not return a list.");
      setFiles(
        data.filter(
          (item): item is DriveItem =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as Record<string, unknown>).id === "string" &&
            typeof (item as Record<string, unknown>).name === "string",
        ),
      );
    } catch (error) {
      setFiles([]);
      setDriveMessage(error instanceof Error ? error.message : "Could not load files from this folder.");
    } finally {
      setFileLoading(false);
    }
  };

  const selectDriveFile = (fileId: string) => {
    const driveFile = files.find((item) => item.id === fileId) ?? null;
    setSelectedDriveFile(driveFile);
    setDriveMessage(null);
    if (driveFile) setFile(null);
  };

  const selectFile = useCallback((candidate: File | undefined | null) => {
    if (!candidate) return;
    setSelectedDriveFile(null);
    const error = validateFile(candidate);
    if (error) {
      setFile(null);
      setStatus("error");
      setMessage(error);
      return;
    }
    setFile(candidate);
    setStatus("idle");
    setProgress(0);
    setMessage(null);
  }, []);

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    selectFile(e.target.files?.[0]);
    e.target.value = ""; // allow re-selecting the same file
  };

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  };
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  };
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (status === "uploading") return;
    const files = e.dataTransfer.files;
    if (files.length > 1) {
      setStatus("error");
      setMessage("Please drop one video at a time.");
      return;
    }
    selectFile(files[0]);
  };

  const openPicker = () => {
    if (status !== "uploading") inputRef.current?.click();
  };
  const onZoneKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  };

  const upload = () => {
    if (selectedDriveFile) {
      setStatus("uploading");
      setProgress(0);
      setDriveMessage(null);

      void fetch(FILE_FETCH_WEBHOOK, {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: selectedDriveFile.id,
          name: selectedDriveFile.name,
        }),
      })
        .then(async (response) => {
          const text = await response.text();
          let data: unknown = text;
          try {
            data = text ? JSON.parse(text) : null;
          } catch {
            data = text;
          }
          if (!response.ok) throw new Error(`File fetch webhook returned HTTP ${response.status}`);
          setProgress(100);
          setStatus("success");
          setDriveMessage(`Selected file sent: ${selectedDriveFile.name}`);
          onUploaded?.(null, data);
        })
        .catch((error: unknown) => {
          setStatus("error");
          setDriveMessage(error instanceof Error ? error.message : "Could not send the selected file.");
        });
      return;
    }

    if (!file) return;
    if (!UPLOAD_ENDPOINT) {
      setStatus("error");
      setMessage("NEXT_PUBLIC_UPLOAD_ENDPOINT is not set. Add it to .env.local and restart the dev server.");
      return;
    }

    const form = new FormData();
    form.append(FIELD_NAME, file, file.name);
    form.append("filename", file.name);
    form.append("mimeType", file.type || "application/octet-stream");
    form.append("size", String(file.size));
    form.append("uploadedAt", new Date().toISOString());

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", UPLOAD_ENDPOINT, true);
    xhr.timeout = 0; // large videos can take a while
    if (UPLOAD_ENDPOINT.includes("ngrok")) xhr.setRequestHeader("ngrok-skip-browser-warning", "true");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      xhrRef.current = null;
      const { data, message: serverMsg } = messageFromResponse(xhr);
      if (xhr.status >= 200 && xhr.status < 300) {
        setProgress(100);
        setStatus("success");
        setMessage(
          serverMsg && serverMsg !== "success"
            ? serverMsg
            : `"${file.name}" uploaded. The n8n workflow will generate tests; they will appear in the file list.`,
        );
        onUploaded?.(file, data);
      } else {
        setStatus("error");
        const hint =
          xhr.status === 404
            ? " (Is the n8n workflow active? Test webhook URLs only work while 'Listen for test event' is running.)"
            : xhr.status === 413
              ? " (File is larger than the endpoint allows.)"
              : "";
        setMessage(`Upload failed: ${serverMsg ?? `HTTP ${xhr.status}`}${hint}`);
      }
    };
    xhr.onerror = () => {
      xhrRef.current = null;
      setStatus("error");
      setMessage(
        "Network error during upload. Check the endpoint URL and that it allows CORS from this site (n8n Webhook → Options → Allowed Origins).",
      );
    };
    xhr.onabort = () => {
      xhrRef.current = null;
      setStatus("idle");
      setProgress(0);
      setMessage("Upload cancelled.");
    };

    setStatus("uploading");
    setProgress(0);
    setMessage(null);
    xhr.send(form);
  };

  const cancel = () => xhrRef.current?.abort();
  const reset = () => {
    setFile(null);
    setSelectedDriveFile(null);
    setStatus("idle");
    setProgress(0);
    setMessage(null);
  };

  const uploading = status === "uploading";

  return (
    <section className="panel">
      <header className="panel-header">
        <div className="panel-header-copy">
          <h2 className="card-title">Upload test recording</h2>
          <p className="panel-meta">Video is sent to the n8n pipeline to generate Playwright tests.</p>
        </div>
        {!UPLOAD_ENDPOINT && (
          <span className="config-chip">Endpoint not configured</span>
        )}
      </header>

      <div className="panel-body">
        <div className="drive-select-grid">
          <div className="field-block">
            <label className="field-label" htmlFor="drive-folder">Google Drive folder</label>
            <select
              id="drive-folder"
              className="input select-input"
              value={selectedFolder?.id ?? ""}
              onChange={(event) => void selectFolder(event.target.value)}
              disabled={folderLoading}
            >
              <option value="">
                {folderLoading ? "Loading folders..." : folders.length ? "Select a folder" : "No folders available"}
              </option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </select>
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="drive-file">File</label>
            <select
              id="drive-file"
              className="input select-input"
              value={selectedDriveFile?.id ?? ""}
              onChange={(event) => void selectDriveFile(event.target.value)}
              disabled={!selectedFolder || fileLoading}
            >
              <option value="">
                {fileLoading
                  ? "Loading files..."
                  : selectedFolder
                    ? files.length
                      ? "Select a file"
                      : "No files available"
                    : "Select a folder first"}
              </option>
              {files.map((driveFile) => (
                <option key={driveFile.id} value={driveFile.id}>{driveFile.name}</option>
              ))}
            </select>
          </div>
        </div>

        {driveMessage && (
          <p role="status" className="notice notice-neutral drive-notice">{driveMessage}</p>
        )}

        <div
          role="button"
          tabIndex={0}
          aria-disabled={uploading}
          aria-label="Choose or drop a video file"
          onClick={openPicker}
          onKeyDown={onZoneKey}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          className={`dropzone${isDragging ? " is-dragging" : ""}`}
        >
          <svg aria-hidden className="dropzone-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <p className="dropzone-prompt">
            <strong>Click to choose</strong> or drag a video here
          </p>
          <p className="helper-text">MP4, MOV, WEBM, MKV, AVI · up to {MAX_UPLOAD_MB} MB</p>
          <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={onInputChange} disabled={uploading} />
        </div>

        {file && (
          <div className="file-summary">
            <div className="min-w-0">
              <p className="file-name truncate" title={file.name}>{file.name}</p>
              <p className="file-meta">
                {formatBytes(file.size)} · {file.type || getExtension(file.name).slice(1).toUpperCase() || "video"}
              </p>
            </div>
            {!uploading && status !== "success" && (
              <button type="button" onClick={reset} className="text-button">
                Remove
              </button>
            )}
          </div>
        )}

        {uploading && (
          <div className="progress-block" aria-live="polite">
            <div className="progress-labels">
              <span>{progress < 99 ? "Uploading…" : "Waiting for server…"}</span>
              <span>{progress}%</span>
            </div>
            <div className="progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-value" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {message && (
          <p
            role={status === "error" ? "alert" : "status"}
            className={`notice ${
              status === "error" ? "notice-error" : status === "success" ? "notice-success" : "notice-neutral"
            }`}
          >
            {message}
          </p>
        )}

        <div className="upload-actions">
          {uploading ? (
            <button type="button" onClick={cancel} className="button button-secondary">
              Cancel
            </button>
          ) : status === "success" ? (
            <button type="button" onClick={reset} className="button button-secondary">
              Upload another
            </button>
          ) : (
            <button
              type="button"
              onClick={upload}
              disabled={!file && !selectedDriveFile}
              className="button button-primary"
            >
              Upload video
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
