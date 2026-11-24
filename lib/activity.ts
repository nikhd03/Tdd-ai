import type { ActivityEvent } from "./types";

export const ACTIVITY_STORAGE_KEY = "tdd-ai.activity-events";
export const ACTIVITY_UPDATED_EVENT = "tdd-ai:activity-updated";
export const VIDEO_TRIGGERS_STORAGE_KEY = "tdd-ai.video-triggers";
const VIDEO_TRIGGERS_GET_WEBHOOK_URL = 'https://ai-automation-stage.oomnieye.com/webhook/video-triggers-count';

const MAX_ACTIVITY_EVENTS = 100;
let videoTriggerSyncRequest: Promise<number> | null = null;

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
}

function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cacheVideoTriggerCount(date: string, count: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      VIDEO_TRIGGERS_STORAGE_KEY,
      JSON.stringify({ date, count } satisfies VideoTriggerStore),
    );
    window.dispatchEvent(new CustomEvent(ACTIVITY_UPDATED_EVENT));
  } catch {
    // Keep the in-memory KPI usable when browser storage is unavailable.
  }
}

export function recordVideoTrigger(): number {
  if (typeof window === "undefined") return 0;
  try {
    const date = todayKey();
    const raw = window.localStorage.getItem(VIDEO_TRIGGERS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<VideoTriggerStore>) : null;
    const next: VideoTriggerStore =
      parsed?.date === date
        ? { date, count: Number(parsed.count) + 1 }
        : { date, count: 1 };
    cacheVideoTriggerCount(next.date, next.count);
    return next.count;
  } catch {
    return 0;
  }
}

export function getVideosTriggeredToday(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(VIDEO_TRIGGERS_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as Partial<VideoTriggerStore>;
    return parsed.date === todayKey() ? Number(parsed.count) || 0 : 0;
  } catch {
    return 0;
  }
}

function countFromResponse(data: unknown): number | null {
  const record =
    Array.isArray(data) && data.length > 0 && typeof data[0] === "object" && data[0] !== null
      ? (data[0] as Record<string, unknown>)
      : data && typeof data === "object"
        ? (data as Record<string, unknown>)
        : null;
  const count = record?.count;
  return typeof count === "number" && Number.isFinite(count) && count >= 0
    ? count
    : null;
}

export function syncVideosTriggeredToday(): Promise<number> {
  if (typeof window === "undefined") return Promise.resolve(0);
  if (videoTriggerSyncRequest) return videoTriggerSyncRequest;

  const date = todayKey();
  const fallbackCount = getVideosTriggeredToday();
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
      if (!response.ok) return fallbackCount;

      const data: unknown = await response.json();
      const count = countFromResponse(data);
      if (count === null) return fallbackCount;

      cacheVideoTriggerCount(date, count);
      return count;
    } catch {
      return fallbackCount;
    } finally {
      videoTriggerSyncRequest = null;
    }
  })();
  videoTriggerSyncRequest = request;
  return request;
}
