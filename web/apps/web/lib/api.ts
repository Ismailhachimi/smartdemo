/** Thin client for the SmartDemo API (same origin, cookie session). */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof data?.message === "string" ? data.message : "Une erreur est survenue.";
    throw new ApiError(message, res.status);
  }
  return data as T;
}

// ---- Types returned by the API ----------------------------------------------------------

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "member";
}

export interface Video {
  id: string;
  title: string;
  status: "uploading" | "ready" | "failed";
  sizeBytes: number;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  hasThumbnail: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VideoListItem extends Video {
  opens: number;
  lastViewAt: string | null;
  linkCount: number;
  shareUrl: string | null;
}

export interface Stats {
  opens: number;
  plays: number;
  uniqueViewers: number;
  avgWatched: number;
  completionRate: number;
  totalWatchSec: number;
  retention: number[];
}

export interface ShareLink {
  id: string;
  slug: string;
  url: string;
  label: string | null;
  hasPassword: boolean;
  expiresAt: string | null;
  allowDownload: boolean;
  notifyOnView: boolean;
  disabled: boolean;
  createdAt: string;
  stats?: Stats;
}

export interface RecentView {
  id: string;
  shareLinkId: string;
  linkLabel: string | null;
  startedAt: string;
  watchedSec: number;
  watched: number;
  completed: boolean;
  device: string;
  referrer: string | null;
}

export interface VideoDetail {
  video: Video;
  shareLinks: ShareLink[];
  stats: Stats;
  recentViews: RecentView[];
}

export interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface ActivityView {
  id: string;
  startedAt: string;
  lastSeenAt: string;
  /** The viewer's player reported progress in the last two minutes. */
  live: boolean;
  watchedSec: number;
  watched: number;
  completed: boolean;
  device: string;
  video: { id: string; title: string; durationSec: number | null; hasThumbnail: boolean; updatedAt: string };
  link: { id: string; label: string | null };
}

export interface Activity {
  week: Stats;
  previousWeek: Stats;
  views: ActivityView[];
}

/** What a share link is called in the UI when it has no label. */
export const linkName = (label: string | null | undefined) => label || "Lien principal";

/** A same-site path to return to after signing in, or null if `raw` is anything else. */
export function safeNext(raw: string | null | undefined): string | null {
  return raw && /^\/(?![/\\])[\w\-./?=&%#]*$/.test(raw) && raw.length <= 200 ? raw : null;
}
