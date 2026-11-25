import type { Metadata } from "next";
import { SharePlayer, type ShareMeta } from "@/components/share-player";

export const dynamic = "force-dynamic";

const apiUrl = process.env.API_INTERNAL_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;

type Result = { ok: true; meta: ShareMeta } | { ok: false; status: number; message: string };

async function load(slug: string): Promise<Result> {
  try {
    const res = await fetch(`${apiUrl}/api/public/s/${encodeURIComponent(slug)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, message: data?.message ?? "Vidéo indisponible." };
    return { ok: true, meta: data as ShareMeta };
  } catch {
    return { ok: false, status: 503, message: "Le serveur est momentanément indisponible." };
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await load(slug);
  if (!r.ok) return { title: "Vidéo indisponible", robots: { index: false } };
  const image = r.meta.hasThumbnail ? `/api/public/s/${slug}/thumbnail` : undefined;
  return {
    title: r.meta.title,
    robots: { index: false, follow: false },
    openGraph: { title: r.meta.title, type: "video.other", images: image ? [{ url: image }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title: r.meta.title, images: image ? [image] : undefined },
  };
}

export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await load(slug);

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-6 sm:py-10">
      {r.ok ? (
        <SharePlayer meta={r.meta} />
      ) : (
        <div className="m-auto max-w-sm text-center">
          <div className="text-4xl">{r.status === 410 ? "⌛" : "🔍"}</div>
          <h1 className="mt-3 text-lg font-semibold">{r.status === 410 ? "Lien expiré" : "Vidéo indisponible"}</h1>
          <p className="mt-2 text-sm text-ink-2">{r.message}</p>
        </div>
      )}
      <footer className="mt-auto pt-10 text-center text-xs text-ink-3">
        Partagé avec <span className="font-medium text-ink-2">SmartDemo</span>
      </footer>
    </main>
  );
}
