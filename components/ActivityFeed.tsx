import { useMemo, useState } from "react";
import { clearActivities } from "@/lib/activity";
import { formatRelative } from "@/lib/format";
import type { ActivityEvent } from "@/lib/types";

type FeedFilter = "All" | "Uploads" | "Generated" | "Errors";

interface ActivityFeedProps {
  events: ActivityEvent[];
  onClear?: () => void;
}

export default function ActivityFeed({ events, onClear }: ActivityFeedProps) {
  const [filter, setFilter] = useState<FeedFilter>("All");
  const filters: FeedFilter[] = ["All", "Uploads", "Generated", "Errors"];

  const filtered = useMemo(() => {
    if (filter === "All") return events;
    if (filter === "Uploads") return events.filter((event) => event.category === "upload");
    if (filter === "Generated") return events.filter((event) => event.category === "generated");
    return events.filter((event) => event.category === "error" || event.status === "error");
  }, [events, filter]);

  const handleClear = () => {
    clearActivities();
    onClear?.();
  };

  return (
    <section className="panel activity-panel">
      <header className="panel-header activity-header">
        <div className="panel-header-copy">
          <h2 className="card-title">Activity</h2>
          <p className="panel-meta">{events.length} recent event{events.length === 1 ? "" : "s"}</p>
        </div>
        <button type="button" onClick={handleClear} disabled={events.length === 0} className="text-button">
          Clear history
        </button>
      </header>

      <div className="activity-filters" aria-label="Activity filters">
        {filters.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            className={`activity-filter${filter === item ? " is-active" : ""}`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="activity-list">
        {filtered.length === 0 ? (
          <div className="activity-empty">No activity in this category.</div>
        ) : (
          filtered.slice(0, 30).map((event) => (
            <article key={event.id} className="activity-item">
              <span className={`activity-status activity-status-${event.status}`}>
                {event.status}
              </span>
              <div className="activity-content">
                <div className="activity-title-row">
                  <strong>{event.title}</strong>
                  <time dateTime={event.timestamp}>
                    {formatRelative(event.timestamp)}
                  </time>
                </div>
                {event.message && <p>{event.message}</p>}
                <span className="activity-source">{event.source}</span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
