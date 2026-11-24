"use client";

import { useRef, useState } from "react";
import { downloadTestFile } from "@/lib/api";
import { copyToClipboard, getFileDownloadUrl, getStandaloneFileViewUrl } from "@/lib/dashboard-links";
import type { ActivityEvent } from "@/lib/types";

interface FileLinkOptionsProps {
  filename: string;
  onActivity?: (event: Omit<ActivityEvent, "id" | "timestamp">) => void;
}

export default function FileLinkOptions({ filename, onActivity }: FileLinkOptionsProps) {
  const [copied, setCopied] = useState<"view" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyLink = async (kind: "view" | "download") => {
    const url = kind === "view"
      ? getStandaloneFileViewUrl(filename)
      : getFileDownloadUrl(filename);

    try {
      await copyToClipboard(url);
      setCopied(kind);
      setError(null);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 2000);
      onActivity?.({
        category: "copy",
        status: "success",
        source: "VM Server",
        title: kind === "view" ? "Standalone view link copied" : "Download link copied",
        message: filename,
        metadata: { fileName: filename, linkType: kind },
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not copy the link.";
      setError(message);
      onActivity?.({
        category: "error",
        status: "error",
        source: "VM Server",
        title: "Could not copy file link",
        message,
      });
    }
  };

  const download = async () => {
    setError(null);
    try {
      await downloadTestFile(filename);
      onActivity?.({
        category: "download",
        status: "success",
        source: "VM Server",
        title: "Generated file downloaded",
        message: filename,
        metadata: { fileName: filename },
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Download failed.";
      setError(message);
      onActivity?.({
        category: "error",
        status: "error",
        source: "VM Server",
        title: "Generated file download failed",
        message,
      });
    }
  };

  return (
    <details className="file-link-options">
      <summary className="button button-secondary file-link-toggle">Link Options</summary>
      <div className="file-link-options-panel">
        <div className="file-link-option">
          <div className="file-link-copy">
            <strong>Standalone View Link</strong>
            <span>Opens the file without the dashboard.</span>
          </div>
          <div className="file-link-actions">
            <button type="button" className="button button-secondary" onClick={() => void copyLink("view")}>
              {copied === "view" ? "Copied!" : "Copy Link"}
            </button>
            <a
              className="button button-secondary"
              href={`/view?file=${encodeURIComponent(filename)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onActivity?.({
                category: "view",
                status: "success",
                source: "VM Server",
                title: "Standalone file view opened",
                message: filename,
              })}
            >
              Open in new tab
            </a>
          </div>
        </div>
        <div className="file-link-option">
          <div className="file-link-copy">
            <strong>Download Link</strong>
            <span>Share a direct dashboard download URL.</span>
          </div>
          <div className="file-link-actions">
            <button type="button" className="button button-secondary" onClick={() => void copyLink("download")}>
              {copied === "download" ? "Copied!" : "Copy Link"}
            </button>
            <button type="button" className="button button-primary" onClick={() => void download()}>
              Download
            </button>
          </div>
        </div>
        {error && <p className="notice notice-error file-link-error" role="alert">{error}</p>}
      </div>
    </details>
  );
}
