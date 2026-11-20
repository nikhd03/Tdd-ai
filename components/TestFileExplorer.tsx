"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, listTestFiles, VM_API_URL } from "@/lib/api";
import { formatBytes, formatDateTime, formatRelative } from "@/lib/format";
import type { TestFileInfo } from "@/lib/types";

const AUTO_REFRESH_MS = 10_000;

interface TestFileExplorerProps {
  selectedName: string | null;
  onSelect: (file: TestFileInfo) => void;
  /** Bump this number to force a refresh and turn auto-refresh on (e.g. after an upload). */
  refreshSignal?: number;
  /** Receives every freshly loaded list (lets the parent keep the selected file's metadata in sync). */
  onFilesChange?: (files: TestFileInfo[]) => void;
}

export default function TestFileExplorer({ selectedName, onSelect, refreshSignal = 0, onFilesChange }: TestFileExplorerProps) {
  const [files, setFiles] = useState<TestFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [query, setQuery] = useState("");
  const [newNames, setNewNames] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  const knownNames = useRef<Set<string> | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const onFilesChangeRef = useRef(onFilesChange);
  useEffect(() => {
    onFilesChangeRef.current = onFilesChange;
  }, [onFilesChange]);

  const load = useCallback(async (mode: "initial" | "manual" | "auto") => {
    if (inFlight.current) {
      if (mode === "auto") return; // don't stack background polls
      inFlight.current.abort();
    }
    const controller = new AbortController();
    inFlight.current = controller;
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const list = await listTestFiles(controller.signal);
      if (controller.signal.aborted) return;

      // Highlight files that appeared since the previous successful load
      if (knownNames.current) {
        const prev = knownNames.current;
        const added = list.filter((f) => !prev.has(f.name)).map((f) => f.name);
        if (added.length) setNewNames((s) => new Set([...s, ...added]));
      }
      knownNames.current = new Set(list.map((f) => f.name));

      setFiles(list);
      onFilesChangeRef.current?.(list);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Failed to load files.");
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load("initial");
    return () => inFlight.current?.abort();
  }, [load]);

  // External refresh trigger (after a successful upload)
  useEffect(() => {
    if (refreshSignal > 0) {
      setAutoRefresh(true);
      void load("manual");
    }
  }, [refreshSignal, load]);

  // Auto-refresh, paused while the tab is hidden
  useEffect(() => {
    if (!autoRefresh) return;
    const tick = () => {
      if (document.visibilityState === "visible") void load("auto");
    };
    const id = setInterval(tick, AUTO_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load("auto");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [autoRefresh, load]);

  // Keep relative timestamps fresh
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? files.filter((f) => f.name.toLowerCase().includes(q)) : files;
  }, [files, query]);

  const totalSize = useMemo(() => files.reduce((sum, f) => sum + (f.size || 0), 0), [files]);

  const handleSelect = (file: TestFileInfo) => {
    setNewNames((s) => {
      if (!s.has(file.name)) return s;
      const next = new Set(s);
      next.delete(file.name);
      return next;
    });
    onSelect(file);
  };

  return (
    <section className="panel explorer-panel">
      <header className="panel-header">
        <div className="panel-header-copy">
          <h2 className="card-title">Generated tests</h2>
          <p className="panel-meta">
            {files.length} file{files.length === 1 ? "" : "s"} · {formatBytes(totalSize)}
            {lastUpdated && <> · updated {lastUpdated.toLocaleTimeString()}</>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load("manual")}
          disabled={loading || refreshing}
          className="button button-secondary"
        >
          <svg aria-hidden className={refreshing || loading ? "refresh-icon is-spinning" : "refresh-icon"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992m0 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
          Refresh
        </button>
      </header>

      <div className="panel-body explorer-tools">
        <div className="search-row">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter files…"
            className="input"
          />
          <label className="switch-label">
            <input
              type="checkbox"
              className="switch-input"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span className="switch-track" aria-hidden="true" />
            Auto (10s)
          </label>
        </div>
      </div>

      {error && (
        <div role="alert" className="alert-box">
          <p>{error}</p>
          {!VM_API_URL ? null : (
            <p className="break-all">API: {VM_API_URL}/api/tests</p>
          )}
          {files.length > 0 && <p>Showing the last loaded list.</p>}
        </div>
      )}

      <div className="explorer-list">
        {loading ? (
          <ul className="file-list skeleton-list" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="skeleton-row" />
            ))}
          </ul>
        ) : files.length === 0 && !error ? (
          <div className="empty-state">
            <svg className="empty-state-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6M8 13h8m-8 4h8" />
            </svg>
            <p className="empty-state-title">No generated tests yet</p>
            <p className="empty-state-copy">Upload a recording; files saved by n8n will show up here.</p>
          </div>
        ) : filtered.length === 0 && files.length > 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">No matching files</p>
            <p className="empty-state-copy">No files match “{query}”.</p>
          </div>
        ) : (
          <ul className="file-list">
            {filtered.map((file) => {
              const selected = file.name === selectedName;
              const isNew = newNames.has(file.name);
              return (
                <li key={file.name}>
                  <button
                    type="button"
                    onClick={() => handleSelect(file)}
                    aria-current={selected ? "true" : undefined}
                    className={`file-row${selected ? " is-selected" : ""}`}
                  >
                    <FileBadge name={file.name} />
                    <div className="file-row-content">
                      <div className="file-row-title">
                        <span className="truncate" title={file.name}>
                          {file.name}
                        </span>
                        {isNew && <span className="status-chip">New</span>}
                      </div>
                      <div className="file-row-meta">
                        <span title={formatDateTime(file.createdAt)}>{formatRelative(file.createdAt, now) || formatDateTime(file.createdAt)}</span>
                        <span>·</span>
                        <span>{formatBytes(file.size)}</span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function FileBadge({ name }: { name: string }) {
  const lower = name.toLowerCase();
  const { label, tone } = lower.endsWith(".feature")
    ? { label: "FEAT", tone: "is-success" }
    : lower.endsWith(".spec.ts") || lower.endsWith(".test.ts")
      ? { label: "SPEC", tone: "is-primary" }
      : lower.endsWith(".ts") || lower.endsWith(".tsx")
        ? { label: "TS", tone: "is-primary" }
        : lower.endsWith(".js") || lower.endsWith(".mjs")
          ? { label: "JS", tone: "is-warning" }
          : lower.endsWith(".json")
            ? { label: "JSON", tone: "is-warning" }
            : { label: "FILE", tone: "" };
  return <span className={`file-badge ${tone}`}>{label}</span>;
}
