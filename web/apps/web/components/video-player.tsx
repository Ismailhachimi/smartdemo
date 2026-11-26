"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { IconMaximize, IconMinimize, IconPause, IconPlay, IconReplay, IconVolume, IconVolumeX } from "@/components/icons";
import { formatDuration } from "@/lib/format";

const RATES = [1, 1.25, 1.5, 2];
const HIDE_AFTER_MS = 2500;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * SmartDemo's video player: native <video> for decoding, our own controls on top.
 * Keyboard: Space/K play, ←/→ 5 s, J/L 10 s, ↑/↓ volume, M mute, F fullscreen, 0–9 jump.
 * The <video> element is exposed through `videoRef` so callers can listen to it (analytics)
 * or drive it (seek from the retention chart).
 */
export function VideoPlayer({
  src,
  poster,
  aspect = "16 / 9",
  videoRef,
  allowDownload = true,
  resumeKey,
  onTimeUpdate,
  className = "",
}: {
  src: string;
  poster?: string;
  aspect?: string;
  videoRef?: RefObject<HTMLVideoElement | null>;
  allowDownload?: boolean;
  /** Remember the position in this browser and offer to resume (share page). */
  resumeKey?: string;
  onTimeUpdate?: (video: HTMLVideoElement) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const setVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      video.current = el;
      if (videoRef) videoRef.current = el;
    },
    [videoRef],
  );

  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  /** Fills the window when real fullscreen is refused or never answers (embedded browsers, iframes). */
  const [windowFill, setWindowFill] = useState(false);
  const fullscreen = nativeFullscreen || windowFill;
  const [idle, setIdle] = useState(false);
  const [rateMenu, setRateMenu] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  const [flash, setFlash] = useState<"play" | "pause" | null>(null);

  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSaved = useRef(0);

  // ---- Controls visibility ----
  const wake = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), HIDE_AFTER_MS);
  }, []);
  useEffect(() => () => clearTimeout(idleTimer.current), []);
  const showControls = started && (!playing || !idle || rateMenu || scrubbing);

  // ---- Actions ----
  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused || v.ended) {
      if (v.ended) v.currentTime = 0;
      void v.play().catch(() => {});
      setFlash("play");
    } else {
      v.pause();
      setFlash("pause");
    }
    wake();
  }, [wake]);

  const seek = useCallback((sec: number) => {
    const v = video.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = clamp(sec, 0, v.duration);
    setTime(v.currentTime);
  }, []);

  const setVol = useCallback((value: number) => {
    const v = video.current;
    if (!v) return;
    v.volume = clamp(value, 0, 1);
    v.muted = v.volume === 0;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = box.current;
    const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (windowFill) {
      setWindowFill(false);
      return;
    }
    if (el?.requestFullscreen && document.fullscreenEnabled) {
      let settled = false;
      el.requestFullscreen().then(
        () => (settled = true),
        () => {
          settled = true;
          setWindowFill(true);
        },
      );
      setTimeout(() => !settled && !document.fullscreenElement && setWindowFill(true), 500);
    } else if (v?.webkitEnterFullscreen) {
      v.webkitEnterFullscreen(); // iPhone Safari: the system player
    } else {
      setWindowFill(true);
    }
  }, [windowFill]);

  useEffect(() => {
    const onChange = () => {
      const on = document.fullscreenElement === box.current;
      setNativeFullscreen(on);
      if (on) setWindowFill(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Window fill: no page scroll behind the player, and Escape leaves it.
  useEffect(() => {
    if (!windowFill) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    root.classList.add("sd-player-fill"); // lets the player rise above the sidebar (globals.css)
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setWindowFill(false);
    document.addEventListener("keydown", onKey);
    box.current?.focus();
    return () => {
      root.style.overflow = prev;
      root.classList.remove("sd-player-fill");
      document.removeEventListener("keydown", onKey);
    };
  }, [windowFill]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 450);
    return () => clearTimeout(t);
  }, [flash]);

  function onKey(e: KeyboardEvent) {
    const v = video.current;
    if (!v || (e.target as HTMLElement).tagName === "INPUT") return;
    const k = e.key.toLowerCase();
    if (k === " " || k === "k") toggle();
    else if (k === "arrowleft") seek(v.currentTime - 5);
    else if (k === "arrowright") seek(v.currentTime + 5);
    else if (k === "j") seek(v.currentTime - 10);
    else if (k === "l") seek(v.currentTime + 10);
    else if (k === "arrowup") setVol(v.volume + 0.1);
    else if (k === "arrowdown") setVol(v.volume - 0.1);
    else if (k === "m") v.muted = !v.muted;
    else if (k === "f") toggleFullscreen();
    else if (/^[0-9]$/.test(k)) seek((Number(k) / 10) * v.duration);
    else return;
    e.preventDefault();
    wake();
  }

  // Touch: the first tap shows the controls, the next one plays or pauses.
  function onSurfacePointerUp(e: PointerEvent) {
    if (e.pointerType === "touch" && playing && idle) return wake();
    toggle();
  }

  // ---- Resume where this browser left off ----
  const storageKey = resumeKey ? `sd_pos:${resumeKey}` : null;
  function onLoadedMetadata() {
    const v = video.current;
    if (!v) return;
    setDuration(v.duration);
    if (!storageKey) return;
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (saved > 5 && saved < v.duration - 5) setResumeAt(saved);
    } catch {}
  }
  function savePosition(t: number) {
    if (!storageKey || Math.abs(t - lastSaved.current) < 2) return;
    lastSaved.current = t;
    try {
      localStorage.setItem(storageKey, String(Math.floor(t)));
    } catch {}
  }

  // On a server-rendered page the browser can load the metadata before React attaches its
  // listeners: read whatever is already there.
  useEffect(() => {
    const v = video.current;
    if (v && v.readyState >= 1) onLoadedMetadata();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={box}
      tabIndex={0}
      onKeyDown={onKey}
      onPointerMove={wake}
      onContextMenu={allowDownload ? undefined : (e) => e.preventDefault()}
      aria-label="Lecteur vidéo"
      className={`group/player isolate overflow-hidden ${windowFill ? "fixed inset-0 z-[100]" : "relative"} bg-black outline-none select-none focus-visible:ring-2 focus-visible:ring-brand ${
        playing && idle && !rateMenu ? "cursor-none" : ""
      } ${fullscreen ? "" : className}`}
      style={fullscreen ? undefined : { aspectRatio: aspect }}
    >
      <video
        ref={setVideo}
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        controlsList={allowDownload ? undefined : "nodownload"}
        className="absolute inset-0 size-full object-contain"
        onPointerUp={onSurfacePointerUp}
        onDoubleClick={toggleFullscreen}
        onPlay={() => {
          setPlaying(true);
          setStarted(true);
          setEnded(false);
          setResumeAt(null);
          wake();
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setEnded(true);
          if (storageKey) {
            try {
              localStorage.removeItem(storageKey);
            } catch {}
          }
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onLoadedMetadata={onLoadedMetadata}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setTime(v.currentTime);
          savePosition(v.currentTime);
          onTimeUpdate?.(v);
        }}
        onProgress={(e) => {
          const v = e.currentTarget;
          const b = v.buffered;
          for (let i = 0; i < b.length; i++) {
            if (b.start(i) <= v.currentTime && v.currentTime <= b.end(i)) return setBuffered(b.end(i));
          }
        }}
        onVolumeChange={(e) => {
          setMuted(e.currentTarget.muted);
          setVolume(e.currentTarget.volume);
        }}
        onRateChange={(e) => setRate(e.currentTarget.playbackRate)}
      />

      {/* Before the first play, and at the end: a frosted pill that says what you get. */}
      {(!started || ended) && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/40 via-black/10 to-black/5">
          <button
            type="button"
            onClick={toggle}
            aria-label={ended ? "Revoir la vidéo" : "Lire la vidéo"}
            className="group/play flex h-12 items-center gap-3 rounded-full bg-black/40 py-1.5 pr-5 pl-1.5 text-white shadow-[0_10px_30px_-10px_rgb(0_0_0/0.6)] ring-1 ring-white/20 backdrop-blur-xl transition-[background-color,transform] duration-200 outline-none hover:bg-black/55 focus-visible:ring-2 focus-visible:ring-white active:scale-[0.97] sm:h-14 sm:pr-6 sm:pl-2"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-white text-black transition-transform duration-200 group-hover/play:scale-105 sm:size-10 [&_svg]:size-4 sm:[&_svg]:size-[18px]">
              {ended ? <IconReplay /> : <IconPlay className="translate-x-px" />}
            </span>
            <span className="text-[15px] font-medium tracking-tight">{ended ? "Revoir" : "Regarder"}</span>
            {!ended && duration > 0 && <span className="tc text-[13px] text-white/60">{formatDuration(duration)}</span>}
          </button>
          {!started && resumeAt != null && (
            <button
              type="button"
              onClick={() => {
                seek(resumeAt);
                toggle();
              }}
              className="absolute top-4 left-4 inline-flex h-8 items-center gap-2 rounded-full bg-black/60 px-3 text-xs font-medium text-white ring-1 ring-white/15 backdrop-blur-md hover:bg-black/75"
            >
              <IconPlay className="size-3" /> Reprendre à <span className="tc">{formatDuration(resumeAt)}</span>
            </button>
          )}
        </div>
      )}

      {/* Feedback when toggling with a click or a key. */}
      {flash && started && !ended && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex size-16 animate-[sd-pop_450ms_ease-out_forwards] items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm [&_svg]:size-7">
            {flash === "play" ? <IconPlay className="translate-x-[2px]" /> : <IconPause />}
          </span>
        </div>
      )}

      {waiting && playing && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="size-10 animate-spin rounded-full border-[3px] border-white/25 border-t-white" />
        </div>
      )}

      {/* Control bar */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-3 pt-12 pb-2 transition-opacity duration-300 sm:px-4 ${
          showControls ? "opacity-100 [&>*]:pointer-events-auto" : "opacity-0"
        }`}
      >
        <Scrubber
          time={time}
          duration={duration}
          buffered={buffered}
          onSeek={seek}
          onScrub={(on) => {
            setScrubbing(on);
            wake();
          }}
        />
        <div className="mt-1 flex items-center gap-1 text-white">
          <ControlButton label={playing ? "Pause (K)" : "Lecture (K)"} onClick={toggle}>
            {playing ? <IconPause /> : <IconPlay />}
          </ControlButton>

          <div className="group/vol flex items-center">
            <ControlButton
              label={muted ? "Activer le son (M)" : "Couper le son (M)"}
              onClick={() => {
                const v = video.current;
                if (!v) return;
                v.muted = !v.muted;
                if (!v.muted && v.volume === 0) v.volume = 0.6;
              }}
            >
              {muted || volume === 0 ? <IconVolumeX /> : <IconVolume />}
            </ControlButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => setVol(Number(e.target.value))}
              aria-label="Volume"
              className="sd-volume w-0 opacity-0 transition-all duration-200 group-hover/vol:w-20 group-hover/vol:opacity-100 focus-visible:w-20 focus-visible:opacity-100"
              style={{ ["--fill" as string]: `${(muted ? 0 : volume) * 100}%` }}
            />
          </div>

          <span className="tc ml-2 text-xs text-white/90">
            {formatDuration(time)} <span className="text-white/45">/ {formatDuration(duration || 0)}</span>
          </span>

          <div className="ml-auto flex items-center gap-1">
            <div className="relative">
              <button
                type="button"
                onClick={() => setRateMenu((o) => !o)}
                aria-label="Vitesse de lecture"
                aria-expanded={rateMenu}
                className="tc h-8 min-w-11 cursor-pointer rounded-md px-2 text-xs font-semibold text-white/90 transition-colors hover:bg-white/15 hover:text-white"
              >
                {rate}×
              </button>
              {rateMenu && (
                <div role="menu" className="absolute right-0 bottom-full mb-2 min-w-28 rounded-lg bg-black/85 p-1 ring-1 ring-white/10 backdrop-blur-md">
                  {RATES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="menuitemradio"
                      aria-checked={r === rate}
                      onClick={() => {
                        if (video.current) video.current.playbackRate = r;
                        setRateMenu(false);
                      }}
                      className={`tc flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-xs ${
                        r === rate ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {r === 1 ? "Normale" : `${r}×`}
                      {r === rate && <span className="size-1.5 rounded-full bg-[#9d8cff]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <ControlButton label={fullscreen ? "Quitter le plein écran (F)" : "Plein écran (F)"} onClick={toggleFullscreen}>
              {fullscreen ? <IconMinimize /> : <IconMaximize />}
            </ControlButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-8 cursor-pointer items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/15 hover:text-white [&_svg]:size-[18px]"
    >
      {children}
    </button>
  );
}

/** Progress bar: buffered range, played range in brand violet, a handle and a time tooltip. */
function Scrubber({
  time,
  duration,
  buffered,
  onSeek,
  onScrub,
}: {
  time: number;
  duration: number;
  buffered: number;
  onSeek: (sec: number) => void;
  onScrub: (active: boolean) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);

  const at = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return clamp((clientX - r.left) / r.width, 0, 1);
  };
  const played = drag ?? (duration ? time / duration : 0);
  const pct = (v: number) => `${v * 100}%`;

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label="Position"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(time)}
      aria-valuetext={`${formatDuration(time)} sur ${formatDuration(duration)}`}
      className="group/scrub relative flex h-5 cursor-pointer touch-none items-center outline-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const f = at(e.clientX);
        setDrag(f);
        onScrub(true);
        onSeek(f * duration);
      }}
      onPointerMove={(e) => {
        const f = at(e.clientX);
        setHover(f);
        if (drag != null) {
          setDrag(f);
          onSeek(f * duration);
        }
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDrag(null);
        onScrub(false);
      }}
      onPointerLeave={() => setHover(null)}
    >
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/20 transition-[height] duration-150 group-hover/scrub:h-1.5">
        <div className="absolute inset-y-0 left-0 bg-white/25" style={{ width: duration ? pct(buffered / duration) : 0 }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#6a4dff] to-[#a597ff]" style={{ width: pct(played) }} />
      </div>
      <div
        className={`absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_4px_rgb(106_77_255/0.45)] transition-transform duration-150 ${
          drag != null ? "scale-100" : "scale-0 group-hover/scrub:scale-100 group-focus-visible/scrub:scale-100"
        }`}
        style={{ left: pct(played) }}
      />
      {hover != null && duration > 0 && (
        <div
          className="tc pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 rounded-md bg-black/85 px-1.5 py-0.5 text-[11px] text-white ring-1 ring-white/10"
          style={{ left: pct(hover) }}
        >
          {formatDuration(hover * duration)}
        </div>
      )}
    </div>
  );
}
