"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { RetentionChart } from "@/components/retention-chart";
import { CopyButton, ErrorNote, Spinner, Stat } from "@/components/ui";
import { api, type ShareLink, type VideoDetail } from "@/lib/api";
import { formatBytes, formatDate, formatDateTime, formatDuration, formatPercent, timeAgo } from "@/lib/format";

export default function VideoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<VideoDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<VideoDetail>(`/videos/${id}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  useEffect(load, [load]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner />;
  const { video, stats } = data;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/videos" className="text-sm text-ink-2 hover:text-ink">
          ← Vidéos
        </Link>
        <TitleEditor id={video.id} title={video.title} onSaved={load} />
        <p className="mt-1 text-sm text-ink-2">
          {formatDate(video.createdAt)} · {formatDuration(video.durationSec)} · {formatBytes(video.sizeBytes)}
          {video.width && video.height ? ` · ${video.width}×${video.height}` : ""}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <video
          className="aspect-video w-full rounded-2xl border border-border bg-black"
          src={`/api/videos/${video.id}/stream`}
          poster={video.hasThumbnail ? `/api/videos/${video.id}/thumbnail` : undefined}
          controls
          preload="metadata"
        />
        <div className="grid grid-cols-2 content-start gap-3">
          <Stat label="Ouvertures" value={stats.opens} hint={`${stats.uniqueViewers} personne${stats.uniqueViewers > 1 ? "s" : ""}`} />
          <Stat label="Lectures" value={stats.plays} />
          <Stat label="Regardé en moyenne" value={stats.plays ? formatPercent(stats.avgWatched) : "—"} />
          <Stat label="Vue jusqu'au bout" value={stats.plays ? formatPercent(stats.completionRate) : "—"} />
          <div className="col-span-2">
            <Stat label="Temps de visionnage total" value={formatDuration(stats.totalWatchSec)} />
          </div>
        </div>
      </div>

      <section className="card p-5">
        <h2 className="font-semibold">Rétention de l&apos;audience</h2>
        <p className="mb-5 text-sm text-ink-2">Part des lectures qui ont vu chaque passage de la vidéo.</p>
        {stats.plays ? (
          <RetentionChart retention={stats.retention} durationSec={video.durationSec} />
        ) : (
          <p className="py-8 text-center text-sm text-ink-3">Pas encore de lecture.</p>
        )}
      </section>

      <ShareLinks videoId={video.id} links={data.shareLinks} onChange={load} />

      <section className="card overflow-hidden">
        <h2 className="px-5 pt-5 font-semibold">Vues récentes</h2>
        {data.recentViews.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-3">Personne n&apos;a encore ouvert cette vidéo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-ink-2">
                <tr className="border-b border-border">
                  <th className="px-5 py-2 font-medium">Quand</th>
                  <th className="px-5 py-2 font-medium">Lien</th>
                  <th className="px-5 py-2 font-medium">Regardé</th>
                  <th className="px-5 py-2 font-medium">Appareil</th>
                </tr>
              </thead>
              <tbody>
                {data.recentViews.map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 whitespace-nowrap" title={formatDateTime(v.startedAt)}>
                      {timeAgo(v.startedAt)}
                    </td>
                    <td className="px-5 py-2.5 text-ink-2">{v.linkLabel ?? "Lien par défaut"}</td>
                    <td className="px-5 py-2.5 whitespace-nowrap tabular-nums">
                      {v.watchedSec > 0 ? `${formatPercent(v.watched)} · ${formatDuration(v.watchedSec)}` : "Pas lancée"}
                      {v.completed && " ✓"}
                    </td>
                    <td className="px-5 py-2.5 whitespace-nowrap text-ink-2">{v.device}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex justify-end">
        <button
          className="btn-danger"
          onClick={async () => {
            if (!confirm(`Supprimer « ${video.title} » ? La vidéo, ses liens et ses statistiques seront effacés définitivement.`)) return;
            await api(`/videos/${video.id}`, { method: "DELETE" });
            router.replace("/videos");
          }}
        >
          Supprimer la vidéo
        </button>
      </section>
    </div>
  );
}

function TitleEditor({ id, title, onSaved }: { id: string; title: string; onSaved: () => void }) {
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);
  async function save() {
    const t = value.trim();
    if (!t || t === title) return setValue(title);
    await api(`/videos/${id}`, { method: "PATCH", json: { title: t } });
    onSaved();
  }
  return (
    <input
      aria-label="Titre de la vidéo"
      className="mt-2 w-full rounded-lg bg-transparent text-2xl font-semibold tracking-tight outline-none hover:bg-surface-2 focus:bg-surface-2 focus:px-2"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function ShareLinks({ videoId, links, onChange }: { videoId: string; links: ShareLink[]; onChange: () => void }) {
  const [creating, setCreating] = useState(false);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Liens de partage</h2>
          <p className="text-sm text-ink-2">Un lien par prospect pour savoir qui a regardé quoi.</p>
        </div>
        {!creating && (
          <button className="btn-primary" onClick={() => setCreating(true)}>
            Nouveau lien
          </button>
        )}
      </div>

      {creating && (
        <NewLinkForm
          videoId={videoId}
          onDone={() => {
            setCreating(false);
            onChange();
          }}
        />
      )}

      <ul className="mt-4 divide-y divide-border">
        {links.map((l) => (
          <ShareRow key={l.id} link={l} onChange={onChange} />
        ))}
      </ul>
    </section>
  );
}

function NewLinkForm({ videoId, onDone }: { videoId: string; onDone: () => void }) {
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [expires, setExpires] = useState("");
  const [allowDownload, setAllowDownload] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api(`/videos/${videoId}/shares`, {
        method: "POST",
        json: {
          label: label || null,
          password: password || null,
          expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
          allowDownload,
        },
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-xl bg-surface-2 p-4 sm:grid-cols-3">
      <div>
        <label className="label" htmlFor="sl-label">Nom (prospect, entreprise…)</label>
        <input id="sl-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ACME — Julie" />
      </div>
      <div>
        <label className="label" htmlFor="sl-pw">Mot de passe (optionnel)</label>
        <input id="sl-pw" className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={4} />
      </div>
      <div>
        <label className="label" htmlFor="sl-exp">Expire le (optionnel)</label>
        <input id="sl-exp" className="input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} />
        Autoriser le téléchargement
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onDone}>
          Annuler
        </button>
        <button className="btn-primary">Créer</button>
      </div>
      {error && (
        <div className="sm:col-span-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </form>
  );
}

function ShareRow({ link, onChange }: { link: ShareLink; onChange: () => void }) {
  const expired = link.expiresAt ? new Date(link.expiresAt) < new Date() : false;
  const patch = async (body: Record<string, unknown>) => {
    await api(`/shares/${link.id}`, { method: "PATCH", json: body });
    onChange();
  };
  const tags = [
    link.hasPassword && "🔒 Mot de passe",
    link.expiresAt && (expired ? "Expiré" : `Expire le ${formatDate(link.expiresAt)}`),
    link.allowDownload && "Téléchargeable",
    link.disabled && "Désactivé",
  ].filter(Boolean) as string[];

  return (
    <li className={`flex flex-wrap items-center gap-3 py-3 ${link.disabled || expired ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{link.label ?? "Lien par défaut"}</div>
        <div className="truncate text-xs text-ink-2">{link.url}</div>
        {tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      {link.stats && (
        <div className="text-right text-xs text-ink-2 tabular-nums">
          <div>
            {link.stats.opens} ouverture{link.stats.opens > 1 ? "s" : ""}
          </div>
          <div>{link.stats.plays ? `${formatPercent(link.stats.avgWatched)} regardé` : "—"}</div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <CopyButton text={link.url} label="Copier" className="btn-ghost py-1.5 text-xs" />
        <button
          className="btn-ghost py-1.5 text-xs"
          title="Recevoir un email quand ce lien est ouvert"
          onClick={() => patch({ notifyOnView: !link.notifyOnView })}
        >
          {link.notifyOnView ? "🔔 Notifs" : "🔕 Notifs"}
        </button>
        <button className="btn-ghost py-1.5 text-xs" onClick={() => patch({ disabled: !link.disabled })}>
          {link.disabled ? "Réactiver" : "Désactiver"}
        </button>
        <button
          className="btn-danger py-1.5 text-xs"
          onClick={async () => {
            if (!confirm("Supprimer ce lien et ses statistiques ?")) return;
            await api(`/shares/${link.id}`, { method: "DELETE" });
            onChange();
          }}
        >
          Supprimer
        </button>
      </div>
    </li>
  );
}
