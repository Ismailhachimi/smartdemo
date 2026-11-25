"use client";

import { useState } from "react";
import { formatDuration, formatPercent } from "@/lib/format";

/**
 * Audience retention, laid out as a timeline under the player: for each segment of the video,
 * the share of plays that watched it. Single series: one hue, no legend (the section title names
 * it). Hover a bar for its value; click to jump the player there. The playhead tracks the player.
 */
export function RetentionChart({
  retention,
  durationSec,
  position,
  onSeek,
  height = 72,
}: {
  retention: number[];
  durationSec: number | null;
  /** Player position, 0…1. */
  position?: number | null;
  onSeek?: (fraction: number) => void;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = retention.length;

  return (
    <figure>
      <div className="relative" style={{ height }}>
        {/* Recessive guides at 50 % and 100 % */}
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-border" />
        <div className="absolute inset-x-0 border-t border-dashed border-border" style={{ top: height / 2 }} />
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {retention.map((v, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${segmentLabel(i, n, durationSec)} : ${formatPercent(v)} des lectures`}
              className="relative flex h-full flex-1 cursor-pointer items-end"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => onSeek?.(i / n)}
            >
              <span
                className={`block w-full rounded-t-[4px] transition-colors ${hover === i ? "bg-brand-2" : "bg-brand"}`}
                style={{ height: `${Math.max(v > 0 ? 3 : 1.5, v * 100)}%`, opacity: v > 0 ? 1 : 0.25 }}
              />
              {hover === i && (
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-left text-xs whitespace-nowrap shadow-lg">
                  <span className="block font-semibold text-ink tabular-nums">{formatPercent(v)} des lectures</span>
                  <span className="tc block text-ink-2">{segmentLabel(i, n, durationSec)}</span>
                </span>
              )}
            </button>
          ))}
        </div>
        {position != null && position > 0 && (
          <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-rec" style={{ left: `${Math.min(1, position) * 100}%` }} />
        )}
      </div>
      <div className="tc mt-1.5 flex justify-between text-[10px] text-ink-3">
        <span>0:00</span>
        <span>{durationSec ? formatDuration(durationSec / 2) : "50 %"}</span>
        <span>{durationSec ? formatDuration(durationSec) : "fin"}</span>
      </div>
      <figcaption className="sr-only">
        Rétention : {retention.map((v, i) => `${segmentLabel(i, n, durationSec)} ${formatPercent(v)}`).join(", ")}
      </figcaption>
    </figure>
  );
}

function segmentLabel(i: number, n: number, durationSec: number | null) {
  if (!durationSec) return `${Math.round((i / n) * 100)}–${Math.round(((i + 1) / n) * 100)} %`;
  return `${formatDuration((i / n) * durationSec)} – ${formatDuration(((i + 1) / n) * durationSec)}`;
}
