"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { IconDownload, IconLock } from "@/components/icons";
import { Avatar, ErrorNote } from "@/components/ui";
import { VideoPlayer } from "@/components/video-player";
import { api } from "@/lib/api";
import { formatDate, formatDuration } from "@/lib/format";

export interface ShareMeta {
  slug: string;
  title: string;
  senderName: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  allowDownload: boolean;
  hasThumbnail: boolean;
  locked: boolean;
  accessToken: string | null;
}

const BUCKETS = 20;
const FLUSH_MS = 5000;

/** Anonymous id kept in this browser to count unique viewers. No personal data. */
function viewerId(): string {
  try {
    let id = localStorage.getItem("sd_viewer");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("sd_viewer", id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * One view per page load. The effect can run twice (React StrictMode, fast remounts), and two
 * simultaneous requests would both pass the server's "same viewer, recent view" check.
 */
const viewRequests = new Map<string, Promise<string>>();
function startView(slug: string, token: string): Promise<string> {
  let p = viewRequests.get(slug);
  if (!p) {
    p = api<{ viewId: string }>(`/public/s/${slug}/views`, {
      method: "POST",
      json: { viewerId: viewerId(), t: token, referrer: document.referrer || null },
    }).then((r) => r.viewId);
    p.catch(() => viewRequests.delete(slug));
    viewRequests.set(slug, p);
  }
  return p;
}

export function SharePlayer({ meta }: { meta: ShareMeta }) {
  const [token, setToken] = useState(meta.accessToken);

  return (
    <div>
      <header className="mb-6 sm:mb-8">
        {meta.senderName && (
          <div className="mb-4 flex items-center gap-2.5 text-[13px] text-ink-2">
            <Avatar name={meta.senderName} size={26} />
            <span>
              <strong className="font-medium text-ink">{meta.senderName}</strong> vous a envoyé une vidéo
            </span>
          </div>
        )}
        <h1 className="display text-[26px] sm:text-[36px]">{meta.title}</h1>
        <p className="tc mt-2 text-xs text-ink-3">
          {formatDate(meta.createdAt)}
          {meta.durationSec ? ` · ${formatDuration(meta.durationSec)}` : ""}
        </p>
      </header>
      {token ? <Player meta={meta} token={token} /> : <Unlock slug={meta.slug} sender={meta.senderName} onUnlock={setToken} />}
    </div>
  );
}

function Unlock({ slug, sender, onUnlock }: { slug: string; sender: string | null; onUnlock: (t: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ accessToken: string }>(`/public/s/${slug}/unlock`, { method: "POST", json: { password } });
      onUnlock(r.accessToken);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-surface ring-1 ring-white/10">
      <form onSubmit={submit} className="w-full max-w-xs px-6 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-surface-3 text-ink [&_svg]:size-5">
          <IconLock />
        </div>
        <p className="mt-4 font-medium">Vidéo protégée</p>
        <p className="mt-1 text-[13px] text-ink-2">
          Saisissez le mot de passe communiqué par {sender ?? "l'expéditeur"}.
        </p>
        <div className="mt-5 flex gap-2">
          <input
            className="input h-10"
            type="password"
            autoFocus
            required
            aria-label="Mot de passe"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn-primary h-10" disabled={busy}>
            Voir
          </button>
        </div>
        {error && <div className="mt-3 text-left"><ErrorNote>{error}</ErrorNote></div>}
      </form>
    </div>
  );
}

function Player({ meta, token }: { meta: ShareMeta; token: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const base = `/api/public/s/${meta.slug}`;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let viewId: string | null = null;
    let watched = 0;
    let buckets = new Set<number>();
    let completed = false;
    let lastTime = video.currentTime;

    const flush = (beacon = false) => {
      if (!viewId || (watched < 0.05 && buckets.size === 0 && !completed)) return;
      const body = JSON.stringify({
        watchedDelta: Math.min(120, Math.round(watched * 10) / 10),
        position: video.currentTime,
        buckets: [...buckets],
        completed,
      });
      watched = 0;
      buckets = new Set();
      const url = `/api/public/views/${viewId}/progress`;
      if (beacon && navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      else fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
    };

    startView(meta.slug, token)
      .then((id) => (viewId = id))
      .catch(() => {});

    const onTime = () => {
      const t = video.currentTime;
      const dt = t - lastTime;
      lastTime = t;
      // Only count continuous playback, not seeks.
      if (!video.paused && dt > 0 && dt < 1.5) watched += dt;
      const d = video.duration || meta.durationSec || 0;
      if (d > 0 && !video.paused) buckets.add(Math.min(BUCKETS - 1, Math.floor((t / d) * BUCKETS)));
    };
    const onSeek = () => (lastTime = video.currentTime);
    const onEnded = () => {
      completed = true;
      flush();
    };
    const onHide = () => document.visibilityState === "hidden" && flush(true);
    const onPause = () => flush();
    const onPageHide = () => flush(true);

    video.addEventListener("timeupdate", onTime);
    video.addEventListener("seeking", onSeek);
    video.addEventListener("ended", onEnded);
    video.addEventListener("pause", onPause);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    const timer = setInterval(() => flush(), FLUSH_MS);

    return () => {
      clearInterval(timer);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("seeking", onSeek);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("pause", onPause);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      flush(true);
    };
  }, [meta.slug, meta.durationSec, token]);

  const aspect = meta.width && meta.height ? `${meta.width} / ${meta.height}` : "16 / 9";

  return (
    <div>
      {/* Without download permission there is no download control and no "Save video as".
          A deterrent, not protection: whoever can watch the stream can record it. */}
      <VideoPlayer
        videoRef={videoRef}
        src={`${base}/stream?t=${encodeURIComponent(token)}`}
        poster={meta.hasThumbnail ? `${base}/thumbnail` : undefined}
        aspect={aspect}
        allowDownload={meta.allowDownload}
        resumeKey={meta.slug}
        className="rounded-xl shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)] ring-1 ring-white/10"
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-3">L&apos;expéditeur voit si la vidéo a été lue, de façon anonyme.</p>
        {meta.allowDownload && (
          <a className="btn-secondary" href={`${base}/download?t=${encodeURIComponent(token)}`}>
            <IconDownload /> Télécharger
          </a>
        )}
      </div>
    </div>
  );
}
