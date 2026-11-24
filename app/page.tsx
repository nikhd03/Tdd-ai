"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import VideoUploader from "@/components/VideoUploader";
import TestFileExplorer from "@/components/TestFileExplorer";
import CodeViewer from "@/components/CodeViewer";
import KpiBar from "@/components/KpiBar";
import ActivityFeed from "@/components/ActivityFeed";
import { VM_API_URL } from "@/lib/api";
import {
  ACTIVITY_UPDATED_EVENT,
  appendActivity,
  getVideosTriggeredToday,
  loadActivities,
  syncVideosTriggeredToday,
} from "@/lib/activity";
import type {
  ActivityEvent,
  DashboardKpis,
  PipelineStatus,
  TestFileInfo,
} from "@/lib/types";

export default function DashboardPage() {
  const [selected, setSelected] = useState<TestFileInfo | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [kpis, setKpis] = useState<DashboardKpis>({
    totalGeneratedFiles: 0,
    specCount: 0,
    featureCount: 0,
    otherCount: 0,
    videosTriggeredToday: 0,
    pipelineStatus: "Syncing",
    lastUpdated: null,
  });
  const knownFiles = useRef<Set<string> | null>(null);

  useEffect(() => {
    const refresh = () => {
      setActivities(loadActivities());
      setKpis((current) => ({
        ...current,
        videosTriggeredToday: getVideosTriggeredToday(),
      }));
    };
    refresh();
    void syncVideosTriggeredToday();
    window.addEventListener(ACTIVITY_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(ACTIVITY_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Keep the selected file's metadata current; clear it if the file was removed on the VM
  const handleActivity = useCallback(
    (event: Omit<ActivityEvent, "id" | "timestamp">) => {
      appendActivity(event);
      setActivities(loadActivities());
      setKpis((current) => ({
        ...current,
        videosTriggeredToday: getVideosTriggeredToday(),
      }));
    },
    [],
  );

  const handleHealthChange = useCallback(
    (pipelineStatus: PipelineStatus, lastUpdated: string | null) => {
      setKpis((current) => ({
        ...current,
        pipelineStatus,
        lastUpdated: lastUpdated ?? current.lastUpdated,
        videosTriggeredToday: getVideosTriggeredToday(),
      }));
    },
    [],
  );

  const handleFilesChange = useCallback((files: TestFileInfo[]) => {
    void syncVideosTriggeredToday();

    const linkedFilename = new URLSearchParams(window.location.search).get("file");
    const linkedFile = linkedFilename
      ? files.find((file) => file.name === linkedFilename)
      : undefined;
    if (linkedFile) setSelected(linkedFile);

    const names = new Set(files.map((file) => file.name));
    if (knownFiles.current) {
      const added = files.filter((file) => !knownFiles.current?.has(file.name));
      added.forEach((file) => {
        appendActivity({
          category: "generated",
          status: "success",
          source: "VM Server",
          title: "New generated file detected",
          message: file.name,
          metadata: {
            fileName: file.name,
            size: file.size,
          },
        });
      });
      if (added.length) setActivities(loadActivities());
    }
    knownFiles.current = names;

    const specCount = files.filter((file) => file.name.toLowerCase().endsWith(".spec.ts")).length;
    const featureCount = files.filter((file) => file.name.toLowerCase().endsWith(".feature")).length;
    setKpis((current) => ({
      ...current,
      totalGeneratedFiles: files.length,
      specCount,
      featureCount,
      otherCount: files.length - specCount - featureCount,
      videosTriggeredToday: getVideosTriggeredToday(),
    }));

    setSelected((current) => {
      if (!current) return current;
      const match = files.find((f) => f.name === current.name);
      if (!match) return null;
      return match.modifiedAt === current.modifiedAt && match.size === current.size ? current : match;
    });
  }, []);

  const handleFileSelect = useCallback((file: TestFileInfo) => {
    setSelected(file);
    const url = new URL(window.location.href);
    url.searchParams.set("file", file.name);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const handleViewerClose = useCallback(() => {
    setSelected(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("file");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const handleUploaded = useCallback(() => {
    setRefreshSignal((n) => n + 1);
  }, []);

  const toggleTheme = useCallback(() => {
    const nextDarkMode = !darkMode;
    document.documentElement.dataset.themeMode = nextDarkMode ? "dark" : "light";
    setDarkMode(nextDarkMode);
  }, [darkMode]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand-block">
            <div className="page-title-group">
              <svg className="page-title-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5h16M4 12h10M4 19h16" />
                <path d="m17 10 3 2-3 2" />
              </svg>
              <div>
                <h1 className="page-title">TDD AI Testing Dashboard</h1>
                <p className="page-subtitle">Recording → n8n → Playwright tests</p>
              </div>
            </div>
          </div>
          <div className="header-actions">
            <div className="connection-status">
              <span className={`status-dot ${VM_API_URL ? "" : "is-warning"}`} />
              <span className="truncate" title={VM_API_URL || undefined}>
              {VM_API_URL ? `VM: ${VM_API_URL.replace(/^https?:\/\//, "")}` : "VM URL not configured"}
              </span>
            </div>
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={`Switch to ${darkMode ? "light" : "dark"} mode`}
              title={`Switch to ${darkMode ? "light" : "dark"} mode`}
            >
              {darkMode ? (
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
                </svg>
              ) : (
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.9 13A8.5 8.5 0 0 1 11 3.1 8.5 8.5 0 1 0 20.9 13Z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="dashboard-kpi-wrap">
        <KpiBar kpis={kpis} />
      </div>

      <main className="dashboard-layout">
        <div className="left-column">
          <VideoUploader onUploaded={handleUploaded} onActivity={handleActivity} />
        </div>

        <div className="viewer-column">
          <div className="explorer-panel-wrap">
            <TestFileExplorer
              selectedName={selected?.name ?? null}
              onSelect={handleFileSelect}
              refreshSignal={refreshSignal}
              onFilesChange={handleFilesChange}
              onHealthChange={handleHealthChange}
              onActivity={handleActivity}
            />
          </div>
          <ActivityFeed
            events={activities}
            onClear={() => setActivities([])}
          />
          {selected && (
            <CodeViewer
              file={selected}
              modal
              onClose={handleViewerClose}
              onActivity={handleActivity}
            />
          )}
        </div>
      </main>
    </div>
  );
}
