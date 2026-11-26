"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  IconActivity,
  IconArrowLeft,
  IconBell,
  IconBellOff,
  IconCalendar,
  IconDownload,
  IconLock,
  IconMore,
  IconPower,
  IconSliders,
  IconTrash,
  IconX,
} from "@/components/icons";
import { RetentionChart } from "@/components/retention-chart";
import { VideoPlayer } from "@/components/video-player";
import { CopyButton, Empty, ErrorNote, KpiRow, Menu, MenuItem, Meter, Section, Spinner, Switch, useCopy } from "@/components/ui";
import { api, linkName, type ShareLink, type VideoDetail } from "@/lib/api";
import { formatBytes, formatDate, formatDuration, formatPercent, formatTime, formatWatchTime, plural, timeAgo } from "@/lib/format";

export default function VideoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<VideoDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const load = useCallback(() => {
    api<VideoDetail>(`/videos/${id}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [id]);
  useEffect(load, [load]);

  // `?link=` (from the activity feed) preselects a prospect.
  useEffect(() => {
    setSelected(new URLSearchParams(window.location.search).get("link"));
  }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner />;
  const { video } = data;
  const link = data.shareLinks.find((l) => l.id === selected) ?? null;
  const stats = link?.stats ?? data.stats;
  const views = link ? data.recentViews.filter((v) => v.shareLinkId === link.id) : data.recentViews;

  const seek = (fraction: number) => {
    const el = videoRef.current;
    if (!el) return;
    const d = el.duration || video.durationSec || 0;
    el.currentTime = fraction * d;
    void el.play().catch(() => {});
  };

  return (
    <div>
      <Link href="/videos" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
        <IconArrowLeft className="size-3.5" /> Vidéos
      </Link>

      <div className="mb-8 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <TitleEditor id={video.id} title={video.title} onSaved={load} />
          <p className="tc mt-1.5 text-xs text-ink-3">
            {formatDate(video.createdAt)} · {formatDuration(video.durationSec)}
            {video.width && video.height ? ` · ${video.width}×${video.height}` : ""} · {formatBytes(video.sizeBytes)}
          </p>
        </div>
        <Menu label="Plus d'actions" trigger={<IconMore />}>
          {(close) => (
            <>
              <a
                href={`/api/videos/${video.id}/stream`}
                download
                onClick={close}
                role="menuitem"
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] hover:bg-surface-2 [&_svg]:size-4 [&_svg]:text-ink-2"
              >
                <IconDownload /> Télécharger l&apos;original
              </a>
              <MenuItem
                danger
                onClick={async () => {
                  close();
                  if (!confirm(`Supprimer « ${video.title} » ? La vidéo, ses liens et ses statistiques seront effacés définitivement.`)) return;
                  await api(`/videos/${video.id}`, { method: "DELETE" });
                  router.replace("/videos");
                }}
              >
                <IconTrash /> Supprimer la vidéo
              </MenuItem>
            </>
          )}
        </Menu>
      </div>

      {/* Phone: player, share, audience. Desktop: player and audience left, share pinned right. */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <div className="panel overflow-hidden">
            <VideoPlayer
              videoRef={videoRef}
              src={`/api/videos/${video.id}/stream`}
              poster={video.hasThumbnail ? `/api/videos/${video.id}/thumbnail?v=${encodeURIComponent(video.updatedAt)}` : undefined}
              aspect={video.width && video.height ? `${video.width} / ${video.height}` : "16 / 9"}
              onTimeUpdate={(el) => setPosition(el.duration ? el.currentTime / el.duration : null)}
            />
            <div className="border-t border-border px-4 pt-3.5 pb-3">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[13px] font-medium">Rétention de l&apos;audience</span>
                <span className="text-xs text-ink-3">
                  {stats.plays ? "Part des lectures ayant vu chaque passage · clique pour y aller" : "Apparaîtra après la première lecture"}
                </span>
              </div>
              <RetentionChart retention={stats.retention} durationSec={video.durationSec} position={position} onSeek={seek} />
            </div>
          </div>
        </div>

        <aside className="lg:sticky lg:top-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <SharePanel videoId={video.id} links={data.shareLinks} selected={selected} onSelect={setSelected} onChange={load} />
        </aside>

        <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-2">
          <Section
            title="Audience"
            actions={
              link && (
                <button className="chip h-7 cursor-pointer gap-1.5 rounded-full bg-brand-soft px-2.5 text-xs text-brand" onClick={() => setSelected(null)}>
                  {linkName(link.label)} <IconX className="size-3" />
                  <span className="sr-only">Retirer le filtre</span>
                </button>
              )
            }
          >
            <KpiRow
              items={[
                { label: "Ouvertures", value: stats.opens, hint: plural(stats.uniqueViewers, "personne") },
                { label: "Lectures", value: stats.plays },
                { label: "Vu en moyenne", value: stats.plays ? formatPercent(stats.avgWatched) : "—" },
                { label: "Jusqu'au bout", value: stats.plays ? formatPercent(stats.completionRate) : "—" },
                { label: "Temps total", value: formatWatchTime(stats.totalWatchSec) },
              ]}
            />
          </Section>

          <Section title="Vues" description={link ? `Sur le lien « ${linkName(link.label)} »` : "Toutes les ouvertures, la plus récente en premier."}>
            {views.length === 0 ? (
              <Empty icon={<IconActivity />} title="Pas encore de vue">
                Envoie un lien : chaque ouverture apparaîtra ici.
              </Empty>
            ) : (
              <ul className="panel divide-y divide-border">
                {views.map((v) => (
                  <li key={v.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_180px_88px]">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{linkName(v.linkLabel)}</div>
                      <div className="truncate text-xs text-ink-3">{v.device}</div>
                    </div>
                    <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                      <div className="flex items-baseline justify-between text-[13px]">
                        <span className={v.watchedSec ? "tabular-nums" : "text-ink-3"}>
                          {v.completed ? "Vue en entier" : v.watchedSec ? `${formatPercent(v.watched)} regardé` : "Pas lancée"}
                        </span>
                        {v.watchedSec > 0 && <span className="tc text-xs text-ink-3">{formatDuration(v.watchedSec)}</span>}
                      </div>
                      <Meter value={v.watched} className="mt-1.5" />
                    </div>
                    <div className="col-start-2 row-start-1 text-right sm:col-start-auto sm:row-start-auto">
                      <div className="text-[13px]">{timeAgo(v.startedAt)}</div>
                      <div className="tc text-[11px] text-ink-3">{formatTime(v.startedAt)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
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
      aria-label="Titre de la vidéo (modifiable)"
      title="Cliquer pour renommer"
      className="display -mx-2 w-[calc(100%+1rem)] rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-[26px] outline-none hover:border-border focus:border-brand focus:bg-surface sm:text-[30px]"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setValue(title);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

// ---- Sharing -------------------------------------------------------------------------------

function SharePanel({
  videoId,
  links,
  selected,
  onSelect,
  onChange,
}: {
  videoId: string;
  links: ShareLink[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: () => void;
}) {
  const [created, setCreated] = useState<ShareLink | null>(null);
  return (
    <div className="panel">
      <div className="p-4 pb-0">
        <h2 className="text-[15px] font-semibold">Partager</h2>
        <p className="mt-0.5 text-[13px] text-ink-2">Un lien par prospect : tu sauras qui a regardé, et jusqu&apos;où.</p>
      </div>
      <NewLinkForm
        videoId={videoId}
        onCreated={(l) => {
          setCreated(l);
          onChange();
        }}
      />
      {created && (
        <div className="mx-4 mb-4 rounded-lg border border-good/30 bg-good/[0.07] p-3 text-[13px]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-good">Lien copié dans le presse-papier</span>
            <button className="text-ink-3 hover:text-ink" onClick={() => setCreated(null)} aria-label="Fermer">
              <IconX className="size-3.5" />
            </button>
          </div>
          <div className="tc mt-1 truncate text-xs text-ink-2">{created.url}</div>
        </div>
      )}
      <div className="border-t border-border">
        <div className="eyebrow px-4 pt-3.5 pb-1.5">{plural(links.length, "lien")}</div>
        <ul className="px-2 pb-2">
          {links.map((l) => (
            <ShareRow key={l.id} link={l} selected={selected === l.id} onSelect={() => onSelect(selected === l.id ? null : l.id)} onChange={onChange} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function NewLinkForm({ videoId, onCreated }: { videoId: string; onCreated: (l: ShareLink) => void }) {
  const [label, setLabel] = useState("");
  const [options, setOptions] = useState(false);
  const [password, setPassword] = useState("");
  const [expires, setExpires] = useState("");
  const [allowDownload, setAllowDownload] = useState(false);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { copy } = useCopy();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { share } = await api<{ share: ShareLink }>(`/videos/${videoId}/shares`, {
        method: "POST",
        json: {
          label: label || null,
          password: password || null,
          expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
          allowDownload,
          notifyOnView: notify,
        },
      });
      await copy(share.url).catch(() => {});
      onCreated(share);
      setLabel("");
      setPassword("");
      setExpires("");
      setOptions(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 p-4">
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Pour qui ?</span>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Pour qui ? ex. ACME — Julie" maxLength={120} />
        </label>
        <button className="btn-primary" disabled={busy}>
          {busy ? "…" : "Créer"}
        </button>
      </div>
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink"
        aria-expanded={options}
        onClick={() => setOptions((o) => !o)}
      >
        <IconSliders className="size-3.5" />
        {options ? "Masquer les options" : "Mot de passe, expiration, téléchargement"}
      </button>
      {options && (
        <div className="space-y-3 rounded-lg bg-surface-2 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="sl-pw">Mot de passe</label>
              <input id="sl-pw" className="input" value={password} onChange={(e) => setPassword(e.target.value)} minLength={4} placeholder="Aucun" />
            </div>
            <div>
              <label className="label" htmlFor="sl-exp">Expire le</label>
              <input id="sl-exp" className="input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
            </div>
          </div>
          <SwitchRow label="Autoriser le téléchargement" checked={allowDownload} onChange={setAllowDownload} />
          <SwitchRow label="M'alerter par email à l'ouverture" checked={notify} onChange={setNotify} />
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </form>
  );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span>{label}</span>
      <Switch label={label} checked={checked} onChange={onChange} />
    </div>
  );
}

function ShareRow({ link, selected, onSelect, onChange }: { link: ShareLink; selected: boolean; onSelect: () => void; onChange: () => void }) {
  const expired = link.expiresAt ? new Date(link.expiresAt) < new Date() : false;
  const inactive = link.disabled || expired;
  const patch = async (body: Record<string, unknown>) => {
    await api(`/shares/${link.id}`, { method: "PATCH", json: body });
    onChange();
  };
  const s = link.stats;

  return (
    <li className={`group flex items-center gap-1 rounded-lg transition-colors ${selected ? "bg-brand-soft" : "hover:bg-surface-2"}`}>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        title={selected ? "Afficher toute l'audience" : "Voir l'audience de ce lien"}
        className="min-w-0 flex-1 cursor-pointer py-2.5 pl-2.5 text-left"
      >
        <div className="flex items-center gap-1.5">
          <span className={`truncate font-medium ${inactive ? "text-ink-3" : ""}`}>{linkName(link.label)}</span>
          {link.hasPassword && <IconLock className="size-3.5 shrink-0 text-ink-3" aria-label="Protégé par mot de passe" />}
          {link.notifyOnView && !inactive && <IconBell className="size-3.5 shrink-0 text-ink-3" aria-label="Alerte email activée" />}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
          {link.disabled ? (
            <span className="chip">Désactivé</span>
          ) : expired ? (
            <span className="chip">Expiré</span>
          ) : (
            <span className="tabular-nums">
              {s ? `${plural(s.opens, "ouverture")}${s.plays ? ` · ${formatPercent(s.avgWatched)} regardé` : ""}` : "—"}
            </span>
          )}
          {link.expiresAt && !expired && (
            <span className="flex items-center gap-1">
              <IconCalendar className="size-3" /> {formatDate(link.expiresAt)}
            </span>
          )}
          {link.allowDownload && (
            <span className="flex items-center gap-1">
              <IconDownload className="size-3" /> téléchargeable
            </span>
          )}
        </div>
      </button>
      <CopyButton text={link.url} iconOnly label="Copier le lien" className="btn-icon btn-ghost" />
      <Menu label="Options du lien" trigger={<IconMore />}>
        {(close) => (
          <>
            <MenuItem
              onClick={() => {
                close();
                void patch({ notifyOnView: !link.notifyOnView });
              }}
            >
              {link.notifyOnView ? <IconBellOff /> : <IconBell />}
              {link.notifyOnView ? "Couper l'alerte email" : "M'alerter à l'ouverture"}
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                void patch({ disabled: !link.disabled });
              }}
            >
              <IconPower />
              {link.disabled ? "Réactiver le lien" : "Désactiver le lien"}
            </MenuItem>
            <div className="my-1 h-px bg-border" />
            <MenuItem
              danger
              onClick={async () => {
                close();
                if (!confirm(`Supprimer le lien « ${linkName(link.label)} » et ses statistiques ?`)) return;
                await api(`/shares/${link.id}`, { method: "DELETE" });
                onChange();
              }}
            >
              <IconTrash /> Supprimer
            </MenuItem>
          </>
        )}
      </Menu>
    </li>
  );
}
