"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconActivity, IconArrowRight, IconCheck } from "@/components/icons";
import { useSession } from "@/components/session";
import { Empty, ErrorNote, KpiRow, LiveDot, Meter, PageHeader, Section, Spinner, Thumb } from "@/components/ui";
import { api, linkName, type Activity, type ActivityView, type VideoListItem } from "@/lib/api";
import { dayLabel, formatDuration, formatPercent, formatTime, formatWatchTime } from "@/lib/format";

export default function ActivityPage() {
  const { tokens } = useSession();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [videos, setVideos] = useState<VideoListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      Promise.all([api<Activity>("/activity"), api<{ videos: VideoListItem[] }>("/videos")])
        .then(([a, v]) => {
          setActivity(a);
          setVideos(v.videos);
        })
        .catch((err: Error) => setError(err.message));
    void load();
    // Keep "watching now" fresh while the page is open.
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), 20_000);
    return () => clearInterval(timer);
  }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!activity || !videos || !tokens) return <Spinner />;

  const steps = [
    { done: tokens.length > 0, title: "Connecter l'app Mac", text: "Un clic depuis les réglages.", href: "/connect", cta: "Connecter" },
    {
      done: videos.length > 0,
      title: "Envoyer un enregistrement",
      text: "Dans SmartDemo : Partage → Envoyer la dernière vidéo.",
      href: null,
      cta: null,
    },
    {
      done: activity.views.length > 0,
      title: "Partager un lien",
      text: "Un lien par prospect, pour savoir qui a regardé.",
      href: videos[0] ? `/videos/${videos[0].id}` : null,
      cta: "Créer un lien",
    },
  ];
  const onboarding = steps.some((s) => !s.done);
  const live = activity.views.filter((v) => v.live);
  const past = activity.views.filter((v) => !v.live);

  return (
    <div>
      <PageHeader title="Activité" description="Qui a regardé tes vidéos, et jusqu'où." />

      {onboarding && (
        <section className="mb-10 panel p-5" aria-label="Pour démarrer">
          <div className="eyebrow mb-4">Pour démarrer</div>
          <ol className="grid gap-4 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    s.done ? "bg-good text-white" : "border border-border-strong text-ink-2"
                  }`}
                >
                  {s.done ? <IconCheck className="size-3.5" /> : i + 1}
                </span>
                <div className="min-w-0">
                  <div className={`font-medium ${s.done ? "text-ink-3 line-through decoration-ink-3/40" : ""}`}>{s.title}</div>
                  {!s.done && <p className="mt-0.5 text-[13px] text-ink-2">{s.text}</p>}
                  {!s.done && s.href && s.cta && (
                    <Link href={s.href} className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline">
                      {s.cta} <IconArrowRight className="size-3.5" />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <Section title="7 derniers jours" className="mb-10">
        <KpiRow
          items={[
            { label: "Ouvertures", value: activity.week.opens, hint: delta(activity.week.opens, activity.previousWeek.opens) },
            {
              label: "Personnes",
              value: activity.week.uniqueViewers,
              hint: delta(activity.week.uniqueViewers, activity.previousWeek.uniqueViewers),
            },
            { label: "Temps regardé", value: formatWatchTime(activity.week.totalWatchSec), hint: "toutes vidéos confondues" },
            {
              label: "Regardé en moyenne",
              value: activity.week.plays ? formatPercent(activity.week.avgWatched) : "—",
              hint: activity.week.plays ? `sur ${activity.week.plays} lecture${activity.week.plays > 1 ? "s" : ""}` : "aucune lecture",
            },
          ]}
        />
      </Section>

      {live.length > 0 && (
        <Section
          title={
            <span className="flex items-center gap-2">
              <LiveDot /> En ce moment
            </span>
          }
          className="mb-10"
        >
          <ul className="panel divide-y divide-border">
            {live.map((v) => (
              <FeedRow key={v.id} view={v} />
            ))}
          </ul>
        </Section>
      )}

      <Section title="Dernières vues">
        {past.length === 0 && live.length === 0 ? (
          <Empty icon={<IconActivity />} title="Personne n'a encore ouvert de lien">
            Chaque ouverture s&apos;affichera ici avec la part de la vidéo regardée.
          </Empty>
        ) : (
          <div className="space-y-6">
            {groupByDay(past).map(([day, rows]) => (
              <div key={day}>
                <h3 className="eyebrow mb-2">{day}</h3>
                <ul className="panel divide-y divide-border">
                  {rows.map((v) => (
                    <FeedRow key={v.id} view={v} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function FeedRow({ view: v }: { view: ActivityView }) {
  const thumb = v.video.hasThumbnail ? `/api/videos/${v.video.id}/thumbnail?v=${encodeURIComponent(v.video.updatedAt)}` : null;
  return (
    <li>
      <Link
        href={`/videos/${v.video.id}?link=${v.link.id}`}
        className="grid grid-cols-[72px_1fr] items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-surface-2/60 sm:grid-cols-[88px_1fr_160px_64px]"
      >
        <Thumb src={thumb} watched={v.watched} className="row-span-2 sm:row-span-1" />
        <div className="min-w-0">
          <div className="truncate font-medium">{linkName(v.link.label)}</div>
          <div className="truncate text-[13px] text-ink-2">{v.video.title}</div>
        </div>
        <div className="flex items-center gap-3 sm:block">
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            {v.live ? (
              <span className="flex items-center gap-1.5 font-medium text-rec">
                <LiveDot /> {v.watchedSec > 0 ? "En train de regarder" : "Sur la page"}
              </span>
            ) : v.watchedSec > 0 ? (
              <span className="tabular-nums">
                {v.completed ? "Vue en entier" : `${formatPercent(v.watched)} regardé`}
              </span>
            ) : (
              <span className="text-ink-3">Ouverte, pas lancée</span>
            )}
            {v.watchedSec > 0 && <span className="tc text-xs text-ink-3">{formatDuration(v.watchedSec)}</span>}
          </div>
          <Meter value={v.watched} className="mt-1.5 hidden w-full sm:block" />
          <span className="text-xs text-ink-3 sm:hidden">· {formatTime(v.startedAt)}</span>
        </div>
        <div className="hidden text-right sm:block">
          <div className="tc text-[13px]">{formatTime(v.startedAt)}</div>
          <div className="truncate text-[11px] text-ink-3">{v.device.split(" · ")[1] ?? v.device}</div>
        </div>
      </Link>
    </li>
  );
}

function groupByDay(views: ActivityView[]): [string, ActivityView[]][] {
  const groups = new Map<string, ActivityView[]>();
  for (const v of views) {
    const key = dayLabel(v.startedAt);
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  return [...groups];
}

function delta(now: number, before: number): string {
  const d = now - before;
  if (d === 0) return before === 0 ? "rien la semaine dernière" : "comme la semaine dernière";
  return `${d > 0 ? "+" : "−"}${Math.abs(d)} vs semaine dernière`;
}
