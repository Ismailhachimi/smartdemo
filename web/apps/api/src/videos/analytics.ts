import { RETENTION_BUCKETS, type View } from "@smartdemo/db";

export interface VideoStats {
  /** Times a share page was opened. */
  opens: number;
  /** Opens where playback actually started. */
  plays: number;
  uniqueViewers: number;
  /** Average share of the video watched per play, 0…1. */
  avgWatched: number;
  /** Share of plays that reached the end, 0…1. */
  completionRate: number;
  totalWatchSec: number;
  /** For each segment of the video, the share of plays that watched it, 0…1. */
  retention: number[];
}

export function computeStats(rows: Pick<View, "viewerId" | "watchedSec" | "completed" | "buckets">[]): VideoStats {
  const plays = rows.filter((r) => r.watchedSec > 0.5);
  const retention = new Array<number>(RETENTION_BUCKETS).fill(0);
  let watchedSum = 0;
  for (const r of plays) {
    const unique = new Set(r.buckets.filter((b) => b >= 0 && b < RETENTION_BUCKETS));
    for (const b of unique) retention[b] += 1;
    watchedSum += unique.size / RETENTION_BUCKETS;
  }
  const n = plays.length;
  return {
    opens: rows.length,
    plays: n,
    uniqueViewers: new Set(rows.map((r) => r.viewerId)).size,
    avgWatched: n ? watchedSum / n : 0,
    completionRate: n ? plays.filter((r) => r.completed).length / n : 0,
    totalWatchSec: Math.round(rows.reduce((s, r) => s + r.watchedSec, 0)),
    retention: retention.map((c) => (n ? c / n : 0)),
  };
}

/** Very small user-agent summary ("Chrome · macOS") — enough for a views list, no fingerprinting. */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return "Inconnu";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Navigateur";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} · ${os}` : browser;
}
