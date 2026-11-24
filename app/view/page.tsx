import StandaloneFileViewer from "@/components/StandaloneFileViewer";

interface ViewPageProps {
  searchParams: Promise<{ file?: string | string[]; download?: string | string[] }>;
}

export default async function ViewPage({ searchParams }: ViewPageProps) {
  const params = await searchParams;
  const filename = typeof params.file === "string" ? params.file : "";
  const download = params.download === "1";

  return filename ? (
    <StandaloneFileViewer filename={filename} autoDownload={download} />
  ) : (
    <main className="standalone-view-page">
      <section className="panel standalone-view-state">
        No file was specified in the shared link.
      </section>
    </main>
  );
}
