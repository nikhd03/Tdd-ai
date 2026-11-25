import type { ActivityEvent } from "./types";

export const ACTIVITY_STORAGE_KEY = "tdd-ai.activity-events";
export const ACTIVITY_UPDATED_EVENT = "tdd-ai:activity-updated";
export const VIDEO_TRIGGERS_STORAGE_KEY = "tdd-ai.video-triggers";
const VIDEO_TRIGGERS_GET_WEBHOOK_URL = 'https://ai-automation-stage.oomnieye.com/webhook/video-triggers-count';

const MAX_ACTIVITY_EVENTS = 100;
let videoTriggerSyncRequest: Promise<VideoTriggerCounts> | null = null;

function isActivityEvent(value: unknown): value is ActivityEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.id === "string" &&
    typeof event.category === "string" &&
    typeof event.status === "string" &&
    typeof event.source === "string" &&
    typeof event.title === "string" &&
    typeof event.timestamp === "string"
  );
}

export function loadActivities(): ActivityEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ACTIVITY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isActivityEvent).slice(0, MAX_ACTIVITY_EVENTS);
  } catch {
    return [];
  }
}

export function saveActivities(events: ActivityEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(events.slice(0, MAX_ACTIVITY_EVENTS)));
    window.dispatchEvent(new CustomEvent(ACTIVITY_UPDATED_EVENT));
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }
}

export function appendActivity(event: Omit<ActivityEvent, "id" | "timestamp"> & Partial<Pick<ActivityEvent, "id" | "timestamp">>): ActivityEvent {
  const timestamp = event.timestamp ?? new Date().toISOString();
  const id =
    event.id ??
    `${event.category}:${event.status}:${event.source}:${event.title}:${timestamp}`;
  const fullEvent: ActivityEvent = { ...event, id, timestamp };
  const current = loadActivities();

  if (current.some((item) => item.id === id)) return fullEvent;

  saveActivities([fullEvent, ...current].slice(0, MAX_ACTIVITY_EVENTS));
  return fullEvent;
}

export function clearActivities(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACTIVITY_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(ACTIVITY_UPDATED_EVENT));
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }
}

interface VideoTriggerStore {
  date: string;
  count: number;
  totalCount: number;
}

export interface VideoTriggerCounts {
  count: number;
  totalCount: number;
}

function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cacheVideoTriggerCounts(date: string, counts: VideoTriggerCounts): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      VIDEO_TRIGGERS_STORAGE_KEY,
      JSON.stringify({ date, ...counts } satisfies VideoTriggerStore),
    );
    window.dispatchEvent(new CustomEvent(ACTIVITY_UPDATED_EVENT));
  } catch {
    // Keep the in-memory KPI usable when browser storage is unavailable.
  }
}

function readVideoTriggerCounts(): VideoTriggerCounts {
  if (typeof window === "undefined") return { count: 0, totalCount: 0 };
  try {
    const raw = window.localStorage.getItem(VIDEO_TRIGGERS_STORAGE_KEY);
    if (!raw) return { count: 0, totalCount: 0 };
    const parsed = JSON.parse(raw) as Partial<VideoTriggerStore>;
    const count = parsed.date === todayKey() ? Number(parsed.count) : 0;
    const totalCount = Number(parsed.totalCount);
    return {
      count: Number.isFinite(count) && count >= 0 ? count : 0,
      totalCount: Number.isFinite(totalCount) && totalCount >= 0 ? totalCount : 0,
    };
  } catch {
    return { count: 0, totalCount: 0 };
  }
}

export function recordVideoTrigger(): number {
  if (typeof window === "undefined") return 0;
  try {
    const date = todayKey();
    const raw = window.localStorage.getItem(VIDEO_TRIGGERS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<VideoTriggerStore>) : null;
    const count = parsed?.date === date ? Number(parsed.count) : 0;
    const totalCount = Number(parsed?.totalCount);
    const next: VideoTriggerCounts = {
      count: (Number.isFinite(count) && count >= 0 ? count : 0) + 1,
      totalCount: (Number.isFinite(totalCount) && totalCount >= 0 ? totalCount : 0) + 1,
    };
    cacheVideoTriggerCounts(date, next);
    return next.count;
  } catch {
    return 0;
  }
}

export function getVideosTriggeredToday(): number {
  return readVideoTriggerCounts().count;
}

export function getTotalVideosProcessed(): number {
  return readVideoTriggerCounts().totalCount;
}

function countsFromResponse(data: unknown): Partial<VideoTriggerCounts> | null {
  const record =
    Array.isArray(data) && data.length > 0 && typeof data[0] === "object" && data[0] !== null
      ? (data[0] as Record<string, unknown>)
      : data && typeof data === "object"
        ? (data as Record<string, unknown>)
        : null;
  if (!record) return null;

  const count = record.count;
  const totalCount = record.totalCount;
  const counts: Partial<VideoTriggerCounts> = {};
  if (typeof count === "number" && Number.isFinite(count) && count >= 0) {
    counts.count = count;
  }
  if (typeof totalCount === "number" && Number.isFinite(totalCount) && totalCount >= 0) {
    counts.totalCount = totalCount;
  }
  return Object.keys(counts).length > 0 ? counts : null;
}

export function syncVideosTriggeredToday(): Promise<VideoTriggerCounts> {
  if (typeof window === "undefined") return Promise.resolve({ count: 0, totalCount: 0 });
  if (videoTriggerSyncRequest) return videoTriggerSyncRequest;

  const date = todayKey();
  const fallbackCounts = readVideoTriggerCounts();
  const request = (async () => {
    try {
      const url = new URL(VIDEO_TRIGGERS_GET_WEBHOOK_URL);
      url.searchParams.set("date", date);
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
      });
      if (!response.ok) return fallbackCounts;

      const data: unknown = await response.json();
      const counts = countsFromResponse(data);
      if (!counts) return fallbackCounts;

      const syncedCounts = {
        count: counts.count ?? fallbackCounts.count,
        totalCount: counts.totalCount ?? fallbackCounts.totalCount,
      };
      cacheVideoTriggerCounts(date, syncedCounts);
      return syncedCounts;
    } catch {
      return fallbackCounts;
    } finally {
      videoTriggerSyncRequest = null;
    }
  })();
  videoTriggerSyncRequest = request;
  return request;
}
