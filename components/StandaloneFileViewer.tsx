"use client";

import { useEffect, useState } from "react";
import CodeViewer from "@/components/CodeViewer";
import { ApiError, listTestFiles } from "@/lib/api";
import type { TestFileInfo } from "@/lib/types";

interface StandaloneFileViewerProps {
  filename: string;
  autoDownload: boolean;
}

export default function StandaloneFileViewer({ filename, autoDownload }: StandaloneFileViewerProps) {
  const [file, setFile] = useState<TestFileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setFile(null);
    setLoading(true);
    setError(null);

    listTestFiles(controller.signal)
      .then((files) => {
        if (controller.signal.aborted) return;
        const match = files.find((item) => item.name === filename);
        if (!match) {
          setError(`No generated file named "${filename}" was found.`);
          return;
        }
        setFile(match);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(
          reason instanceof ApiError || reason instanceof Error
            ? reason.message
            : "Could not load generated file metadata.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [filename]);

  return (
    <main className="standalone-view-page">
      {file ? (
        <CodeViewer file={file} autoDownload={autoDownload} />
      ) : (
        <section className="panel standalone-view-state" aria-live="polite">
          {loading ? "Loading shared file..." : error ?? "File is unavailable."}
        </section>
      )}
    </main>
  );
}
