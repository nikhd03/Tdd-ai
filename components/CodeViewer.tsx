"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, downloadTestFile, getTestFile, saveBlob } from "@/lib/api";
import { formatBytes, formatDateTime, languageFromFilename } from "@/lib/format";
import type { TestFileContent, TestFileInfo } from "@/lib/types";

interface CodeViewerProps {
  file: TestFileInfo | null;
  onClose?: () => void;
  modal?: boolean;
}

type LoadState =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "ready"; data: TestFileContent }
  | { kind: "error"; message: string; status?: number };

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Permission denied / unfocused document: fall through to legacy copy
    }
  }
  // Fallback for http:// (non-secure) origins and blocked Clipboard API
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) throw new Error("Copy command was rejected by the browser.");
}

export default function CodeViewer({ file, onClose, modal = false }: CodeViewerProps) {
  const [state, setState] = useState<LoadState>({ kind: "empty" });
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const name = file?.name ?? null;

  useEffect(() => {
    setCopied(false);
    setActionError(null);
    if (!name) {
      setState({ kind: "empty" });
      return;
    }
    const controller = new AbortController();
    setState({ kind: "loading" });
    getTestFile(name, controller.signal)
      .then((data) => setState({ kind: "ready", data }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Failed to load file.",
          status: err instanceof ApiError ? err.status : undefined,
        });
      });
    return () => controller.abort();
    // file.modifiedAt changes -> refetch so the viewer stays in sync after regeneration
  }, [name, file?.modifiedAt, file?.size, reloadKey]);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const content = state.kind === "ready" ? state.data.content : "";
  const lines = useMemo(() => (content ? content.replace(/\r\n/g, "\n").split("\n") : []), [content]);
  // Drop the phantom empty line after a trailing newline
  const visibleLines = lines.length > 1 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
  const gutterText = useMemo(() => visibleLines.map((_, i) => i + 1).join("\n"), [visibleLines]);

  const handleCopy = useCallback(async () => {
    if (state.kind !== "ready") return;
    setActionError(null);
    try {
      await copyText(state.data.content);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not copy to clipboard.");
    }
  }, [state]);

  const handleDownload = useCallback(async () => {
    if (!name) return;
    setActionError(null);
    // Content already loaded: save locally, no extra request
    if (state.kind === "ready") {
      saveBlob(new Blob([state.data.content], { type: "text/plain;charset=utf-8" }), name);
      return;
    }
    setDownloading(true);
    try {
      await downloadTestFile(name);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  }, [name, state]);

  const canPreviewFail = state.kind === "error" && (state.status === 413 || state.status === 415);

  const viewer = (
    <section className={`panel viewer-panel${modal ? " viewer-modal-panel" : ""}`}>
      <header className="panel-header viewer-header">
        <div className="panel-header-copy">
          <h2 className="card-title viewer-file-name" title={name ?? undefined}>
            {name ?? "No file selected"}
          </h2>
          {file && (
            <p className="panel-meta">
              {languageFromFilename(file.name)} · {formatBytes(file.size)}
              {state.kind === "ready" && <> · {visibleLines.length} lines</>} · {formatDateTime(file.createdAt)}
            </p>
          )}
        </div>
        <div className="viewer-actions">
          {modal && (
            <button
              type="button"
              onClick={onClose}
              className="button button-secondary viewer-close"
              aria-label="Close code viewer"
              title="Close"
            >
              Close
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            disabled={state.kind !== "ready"}
            className={[
              "button",
              copied ? "button-primary" : "button-secondary",
            ].join(" ")}
            aria-live="polite"
          >
            {copied ? "Copied!" : "Copy Code"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!name || downloading || state.kind === "loading"}
            className="button button-primary"
          >
            {downloading ? "Downloading…" : "Download File"}
          </button>
        </div>
      </header>

      {actionError && (
        <p role="alert" className="notice notice-error">
          {actionError}
        </p>
      )}

      <div className="viewer-content">
        {state.kind === "empty" && (
          <div className="empty-state">
            <svg className="empty-state-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
              <path d="M16 3h5v5M10 14 21 3M7 10h3m-3 4h2" />
            </svg>
            <p className="empty-state-title">Select a file to view its code</p>
            <p className="empty-state-copy">Generated .spec.ts and .feature files appear in the list.</p>
          </div>
        )}

        {state.kind === "loading" && (
          <div className="skeleton-list" aria-busy="true">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="skeleton-line" style={{ width: `${30 + ((i * 37) % 60)}%` }} />
            ))}
          </div>
        )}

        {state.kind === "error" && (
          <div className="empty-state">
            <div>
              <p className="notice-error">{state.message}</p>
              <div className="upload-actions action-center">
                {canPreviewFail ? (
                  <button type="button" onClick={handleDownload} className="button button-primary">
                    Download instead
                  </button>
                ) : (
                  <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="button button-secondary">
                    Retry
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {state.kind === "ready" &&
          (content.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-title">This file is empty</p>
              <p className="empty-state-copy">There is no code to display in this file.</p>
            </div>
          ) : (
            <div className="code-lines">
              <pre aria-hidden className="code-gutter">
                {gutterText}
              </pre>
              <pre className="code-content">
                <code>{visibleLines.join("\n")}</code>
              </pre>
            </div>
          ))}
      </div>
    </section>
  );

  useEffect(() => {
    if (!modal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [modal, onClose]);

  if (modal) {
    return (
      <div
        className="viewer-modal-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose?.();
        }}
      >
        {viewer}
      </div>
    );
  }

  return viewer;
}
