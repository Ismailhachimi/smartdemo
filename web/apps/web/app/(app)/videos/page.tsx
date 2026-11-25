"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { IconEye, IconFilm, IconLink, IconSearch } from "@/components/icons";
import { CopyButton, Empty, ErrorNote, PageHeader, Spinner, Thumb, Viewfinder } from "@/components/ui";
import { api, type VideoListItem } from "@/lib/api";
import { plural, timeAgo } from "@/lib/format";

type Sort = "recent" | "viewed" | "lastView";
const SORTS: { value: Sort; label: string }[] = [
  { value: "recent", label: "Plus récentes" },
  { value: "lastView", label: "Vues récemment" },
  { value: "viewed", label: "Plus vues" },
];

export default function VideosPage() {
  const [videos, setVideos] = useState<VideoListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");

  useEffect(() => {
    api<{ videos: VideoListItem[] }>("/videos")
      .then((r) => setVideos(r.videos))
      .catch((err: Error) => setError(err.message));
  }, []);

  const shown = useMemo(() => {
    if (!videos) return [];
    const q = query.trim().toLowerCase();
    const list = q ? videos.filter((v) => v.title.toLowerCase().includes(q)) : [...videos];
    if (sort === "viewed") list.sort((a, b) => b.opens - a.opens);
    if (sort === "lastView") list.sort((a, b) => (b.lastViewAt ?? "").localeCompare(a.lastViewAt ?? ""));
    return list;
  }, [videos, query, sort]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!videos) return <Spinner />;

  return (
    <div>
      <PageHeader title="Vidéos" description={videos.length ? plural(videos.length, "enregistrement") : "Tes enregistrements envoyés depuis l'app Mac."} />

      {videos.length === 0 ? (
        <Empty
          icon={<IconFilm />}
          title="Aucune vidéo pour l'instant"
          action={
            <Link href="/settings#mac" className="btn-primary">
              Connecter l&apos;app Mac
            </Link>
          }
        >
          Enregistre une démo avec SmartDemo (⌃⌥R), puis choisis « Envoyer la dernière vidéo » dans le menu Partage.
        </Empty>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <label className="relative min-w-56 flex-1 sm:max-w-xs">
              <span className="sr-only">Rechercher</span>
              <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
              <input className="input pl-9" placeholder="Rechercher une vidéo" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <div className="flex rounded-lg border border-border bg-surface p-0.5" role="radiogroup" aria-label="Trier">
              {SORTS.map((s) => (
                <button
                  key={s.value}
                  role="radio"
                  aria-checked={sort === s.value}
                  onClick={() => setSort(s.value)}
                  className={`h-7 cursor-pointer rounded-md px-2.5 text-xs font-medium transition-colors ${
                    sort === s.value ? "bg-surface-3 text-ink" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="py-16 text-center text-ink-2">Aucune vidéo ne correspond à « {query} ».</p>
          ) : (
            <ul className="grid gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((v) => (
                <VideoCard key={v.id} video={v} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function VideoCard({ video: v }: { video: VideoListItem }) {
  const recent = v.lastViewAt && Date.now() - new Date(v.lastViewAt).getTime() < 86_400_000;
  return (
    <li className="group relative">
      <Link href={`/videos/${v.id}`} className="block rounded-lg">
        <Thumb
          src={v.hasThumbnail ? `/api/videos/${v.id}/thumbnail?v=${encodeURIComponent(v.updatedAt)}` : null}
          durationSec={v.durationSec}
          className="ring-1 ring-border transition-shadow group-hover:shadow-[0_10px_30px_-12px_rgb(0_0_0/0.35)]"
        >
          <Viewfinder className="opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        </Thumb>
        <h2 className="mt-3 truncate font-medium">{v.title}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
          <span>{timeAgo(v.createdAt)}</span>
          <span className="flex items-center gap-1">
            <IconEye className="size-3.5 text-ink-3" />
            {plural(v.opens, "vue")}
          </span>
          <span className="flex items-center gap-1">
            <IconLink className="size-3.5 text-ink-3" />
            {plural(v.linkCount, "lien")}
          </span>
        </div>
        {recent && v.lastViewAt && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rec">
            <span className="size-1.5 rounded-full bg-rec" aria-hidden="true" />
            Vue {timeAgo(v.lastViewAt)}
          </div>
        )}
      </Link>
      {v.shareUrl && (
        <div className="absolute top-2 right-2 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          <CopyButton text={v.shareUrl} iconOnly label="Copier le lien principal" className="btn-icon bg-black/60 text-white backdrop-blur hover:bg-black/80" />
        </div>
      )}
    </li>
  );
}
