"use client";

import { useState } from "react";
import { formatDuration, formatPercent } from "@/lib/format";

/**
 * Audience retention: for each segment of the video, the share of plays that watched it.
 * Single series → one hue, no legend (the title names it); per-bar hover tooltip.
 */
export function RetentionChart({ retention, durationSec }: { retention: number[]; durationSec: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = retention.length;
  const H = 140;
  const gridLines = [0, 0.5, 1];

  return (
    <figure>
      <div className="relative" style={{ height: H + 22 }}>
        {/* Recessive grid */}
        {gridLines.map((g) => (
          <div key={g} className="absolute inset-x-0 flex items-center gap-2" style={{ top: H - g * H }}>
            <span className="w-9 -translate-y-1/2 text-right text-[10px] text-ink-3 tabular-nums">{Math.round(g * 100)}%</span>
            <div className={`h-px flex-1 -translate-y-1/2 ${g === 0 ? "bg-border" : "bg-border/60"}`} />
          </div>
        ))}
        {/* Bars: 2px gap, rounded data end, anchored to the baseline */}
        <div className="absolute top-0 right-0 left-11 flex items-end gap-[2px]" style={{ height: H }}>
          {retention.map((v, i) => (
            <div
              key={i}
              className="relative flex h-full flex-1 items-end"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div
                className={`w-full rounded-t-[4px] transition-colors ${hover === i ? "bg-brand-2" : "bg-brand"}`}
                style={{ height: `${Math.max(v > 0 ? 2 : 0, v * 100)}%` }}
              />
              {hover === i && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg">
                  <div className="font-semibold text-ink tabular-nums">{formatPercent(v)} des lectures</div>
                  <div className="text-ink-2">{segmentLabel(i, n, durationSec)}</div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="absolute right-0 bottom-0 left-11 flex justify-between text-[10px] text-ink-3 tabular-nums">
          <span>0:00</span>
          <span>{durationSec ? formatDuration(durationSec) : "fin"}</span>
        </div>
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
