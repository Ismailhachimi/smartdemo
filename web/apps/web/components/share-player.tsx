"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ErrorNote } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

export interface ShareMeta {
  slug: string;
  title: string;
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

export function SharePlayer({ meta }: { meta: ShareMeta }) {
  const [token, setToken] = useState(meta.accessToken);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold tracking-tight sm:text-2xl">{meta.title}</h1>
      <p className="mb-5 text-sm text-ink-2">{formatDate(meta.createdAt)}</p>
      {token ? <Player meta={meta} token={token} /> : <Unlock slug={meta.slug} onUnlock={setToken} />}
    </div>
  );
}

function Unlock({ slug, onUnlock }: { slug: string; onUnlock: (t: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<{ accessToken: string }>(`/public/s/${slug}/unlock`, { method: "POST", json: { password } });
      onUnlock(r.accessToken);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form onSubmit={submit} className="card mx-auto mt-10 max-w-sm space-y-4 p-6">
      <div className="text-center text-3xl">🔒</div>
      <p className="text-center text-sm text-ink-2">Cette vidéo est protégée par un mot de passe.</p>
      <input
        className="input"
        type="password"
        autoFocus
        required
        placeholder="Mot de passe"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      <button className="btn-primary w-full">Voir la vidéo</button>
    </form>
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

    api<{ viewId: string }>(`/public/s/${meta.slug}/views`, {
      method: "POST",
      json: { viewerId: viewerId(), t: token, referrer: document.referrer || null },
    })
      .then((r) => (viewId = r.viewId))
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
      <video
        ref={videoRef}
        className="w-full rounded-2xl border border-border bg-black shadow-xl"
        style={{ aspectRatio: aspect }}
        src={`${base}/stream?t=${encodeURIComponent(token)}`}
        poster={meta.hasThumbnail ? `${base}/thumbnail` : undefined}
        controls
        playsInline
        preload="metadata"
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-3">La lecture est mesurée de façon anonyme pour l&apos;auteur de la vidéo.</p>
        {meta.allowDownload && (
          <a className="btn-ghost" href={`${base}/download?t=${encodeURIComponent(token)}`}>
            Télécharger
          </a>
        )}
      </div>
    </div>
  );
}
