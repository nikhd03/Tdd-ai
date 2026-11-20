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

interface VideoUploaderProps {
  /** Called after the endpoint accepts the upload. */
  onUploaded?: (file: File, response: unknown) => void;
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

  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const dragDepth = useRef(0);

  useEffect(() => () => xhrRef.current?.abort(), []);

  const selectFile = useCallback((candidate: File | undefined | null) => {
    if (!candidate) return;
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
              disabled={!file}
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
