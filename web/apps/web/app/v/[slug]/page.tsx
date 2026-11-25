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
  const description = r.meta.senderName ? `${r.meta.senderName} vous a envoyé une vidéo.` : undefined;
  return {
    title: r.meta.title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title: r.meta.title, description, type: "video.other", images: image ? [{ url: image }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title: r.meta.title, description, images: image ? [image] : undefined },
  };
}

export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await load(slug);

  return (
    <div className="stage relative min-h-dvh overflow-hidden bg-bg text-ink">
      {/* Ambient light from the video's own poster. */}
      {r.ok && r.meta.hasThumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/public/s/${slug}/thumbnail`}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-1/4 h-[90%] w-full scale-110 object-cover opacity-25 blur-[90px] saturate-150"
        />
      )}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent,var(--color-bg)_75%)]" />

      <main className="relative mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pt-8 pb-6 sm:px-6 sm:pt-14">
        {r.ok ? (
          <SharePlayer meta={r.meta} />
        ) : (
          <div className="m-auto max-w-sm text-center">
            <p className="tc text-xs text-ink-3">{r.status === 410 ? "LIEN EXPIRÉ" : "ERREUR " + r.status}</p>
            <h1 className="display mt-3 text-[28px]">{r.status === 410 ? "Ce lien a expiré" : "Vidéo indisponible"}</h1>
            <p className="mt-2 text-ink-2">
              {r.status === 410 ? "Demandez un nouveau lien à la personne qui vous l'a envoyé." : r.message}
            </p>
          </div>
        )}
        <footer className="mt-auto pt-14 text-center text-xs text-ink-3">
          Enregistré avec <span className="font-medium text-ink-2">SmartDemo</span>
        </footer>
      </main>
    </div>
  );
}
