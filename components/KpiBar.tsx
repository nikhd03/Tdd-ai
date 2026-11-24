import type { DashboardKpis } from "@/lib/types";
import { formatRelative } from "@/lib/format";

interface KpiBarProps {
  kpis: DashboardKpis;
}

export default function KpiBar({ kpis }: KpiBarProps) {
  const statusTone =
    kpis.pipelineStatus === "Online"
      ? "is-online"
      : kpis.pipelineStatus === "Syncing"
        ? "is-syncing"
        : "is-offline";

  return (
    <section className="kpi-bar" aria-label="Dashboard metrics">
      <article className="kpi-card">
        <span className="kpi-label">Generated files</span>
        <strong className="kpi-value">{kpis.totalGeneratedFiles}</strong>
        <span className="kpi-caption">Total from VM</span>
      </article>

      <article className="kpi-card">
        <span className="kpi-label">Tests / specs</span>
        <strong className="kpi-value">
          {kpis.specCount} <span className="kpi-divider">/</span> {kpis.featureCount}
        </strong>
        <span className="kpi-caption">
          Specs / Features · {kpis.otherCount} other
        </span>
      </article>

      <article className="kpi-card">
        <span className="kpi-label">Videos today</span>
        <strong className="kpi-value">{kpis.videosTriggeredToday}</strong>
        <span className="kpi-caption">n8n · Google Sheets</span>
      </article>

      <article className="kpi-card">
        <span className="kpi-label">Pipeline status</span>
        <div className="kpi-status-row">
          <span className={`kpi-status-dot ${statusTone}`} />
          <strong className="kpi-status">{kpis.pipelineStatus}</strong>
        </div>
        <span className="kpi-caption">
          {kpis.lastUpdated
            ? `Last sync ${formatRelative(kpis.lastUpdated)}`
            : "Waiting for VM"}
        </span>
      </article>
    </section>
  );
}
