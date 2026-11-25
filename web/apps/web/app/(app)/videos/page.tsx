"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CopyButton, ErrorNote, Spinner } from "@/components/ui";
import { api, type VideoListItem } from "@/lib/api";
import { formatDuration, timeAgo } from "@/lib/format";

export default function VideosPage() {
  const [videos, setVideos] = useState<VideoListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ videos: VideoListItem[] }>("/videos")
      .then((r) => setVideos(r.videos))
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!videos) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vidéos</h1>
          <p className="mt-1 text-sm text-ink-2">
            {videos.length ? `${videos.length} vidéo${videos.length > 1 ? "s" : ""}` : "Envoie ta première vidéo depuis l'app Mac."}
          </p>
        </div>
      </div>

      {videos.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <li key={v.id} className="card group overflow-hidden">
              <Link href={`/videos/${v.id}`} className="block">
                <div className="relative aspect-video bg-surface-2">
                  {v.hasThumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/videos/${v.id}/thumbnail?v=${encodeURIComponent(v.updatedAt)}`}
                      alt=""
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-3xl text-ink-3">▶</div>
                  )}
                  {v.durationSec != null && (
                    <span className="absolute right-2 bottom-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
                      {formatDuration(v.durationSec)}
                    </span>
                  )}
                </div>
                <div className="px-4 pt-3">
                  <h2 className="truncate font-medium">{v.title}</h2>
                  <p className="mt-0.5 text-xs text-ink-2">
                    {timeAgo(v.createdAt)} · {v.opens} vue{v.opens > 1 ? "s" : ""}
                    {v.lastViewAt ? ` · vue ${timeAgo(v.lastViewAt)}` : ""}
                  </p>
                </div>
              </Link>
              <div className="flex gap-2 px-4 pt-3 pb-4">
                {v.shareUrl && <CopyButton text={v.shareUrl} className="btn-ghost flex-1 py-1.5 text-xs" />}
                <Link href={`/videos/${v.id}`} className="btn-ghost flex-1 py-1.5 text-xs">
                  Statistiques
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card mx-auto max-w-xl p-8 text-center">
      <div className="text-4xl">🎬</div>
      <h2 className="mt-3 text-lg font-semibold">Aucune vidéo pour l&apos;instant</h2>
      <ol className="mt-4 space-y-2 text-left text-sm text-ink-2">
        <li>
          1. Dans <Link href="/settings" className="text-brand hover:underline">Réglages</Link>, clique sur « Connecter l&apos;app Mac ».
        </li>
        <li>2. Enregistre une démo avec SmartDemo (⌃⌥R).</li>
        <li>3. Dans le menu SmartDemo, choisis « Envoyer la dernière vidéo » : le lien de partage est copié.</li>
      </ol>
    </div>
  );
}
