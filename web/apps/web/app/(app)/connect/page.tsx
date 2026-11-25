"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IconCheck, IconLaptop } from "@/components/icons";
import { useSession } from "@/components/session";
import { CopyButton, ErrorNote, LogoMark, Spinner } from "@/components/ui";
import { api, type ApiToken } from "@/lib/api";

type State =
  | { step: "ask" }
  | { step: "creating" }
  | { step: "waiting"; id: string; token: string; link: string }
  | { step: "done" };

/**
 * Where the Mac app sends you ("Se connecter avec le navigateur"): authorize this Mac, hand
 * it a token through smartdemo://, and confirm as soon as the app has used it.
 */
export default function ConnectPage() {
  const { user, reloadTokens } = useSession();
  const [state, setState] = useState<State>({ step: "ask" });
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState("ce Mac");
  const [slow, setSlow] = useState(false);
  const server = typeof window === "undefined" ? "" : window.location.origin;

  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("device")?.trim();
    if (d) setDevice(d.slice(0, 60));
  }, []);

  async function authorize() {
    setError(null);
    setState({ step: "creating" });
    try {
      const r = await api<{ token: string; id: string }>("/tokens", {
        method: "POST",
        json: { name: device === "ce Mac" ? "SmartDemo pour Mac" : device },
      });
      const link = `smartdemo://connect?server=${encodeURIComponent(server)}&token=${encodeURIComponent(r.token)}`;
      setState({ step: "waiting", id: r.id, token: r.token, link });
      window.location.href = link;
    } catch (err) {
      setError((err as Error).message);
      setState({ step: "ask" });
    }
  }

  // The app calls the API with the token right away: its "last used" date is our signal.
  const waitingId = state.step === "waiting" ? state.id : null;
  const polls = useRef(0);
  useEffect(() => {
    if (!waitingId) return;
    polls.current = 0;
    const timer = setInterval(async () => {
      polls.current += 1;
      if (polls.current === 6) setSlow(true);
      const { tokens } = await api<{ tokens: ApiToken[] }>("/tokens").catch(() => ({ tokens: [] as ApiToken[] }));
      if (tokens.find((t) => t.id === waitingId)?.lastUsedAt) {
        clearInterval(timer);
        setState({ step: "done" });
        reloadTokens();
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [waitingId, reloadTokens]);

  return (
    <div className="mx-auto max-w-md pt-6 sm:pt-12">
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-center gap-3 border-b border-border bg-surface-2/50 py-8">
          <span className="flex size-12 items-center justify-center rounded-xl border border-border bg-surface text-ink-2 [&_svg]:size-6">
            <IconLaptop />
          </span>
          <span className="flex gap-1" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`size-1.5 rounded-full ${state.step === "done" ? "bg-good" : "bg-border-strong"} ${state.step === "waiting" ? "animate-rec" : ""}`}
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </span>
          <LogoMark size={48} />
        </div>

        <div className="p-6">
          {state.step === "done" ? (
            <div className="text-center">
              <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-good text-white [&_svg]:size-5">
                <IconCheck />
              </div>
              <h1 className="display mt-4 text-[24px]">SmartDemo est connecté</h1>
              <p className="mt-2 text-ink-2">
                {device === "ce Mac" ? "Ce Mac" : device} envoie maintenant ses vidéos sur le compte <strong className="font-medium text-ink">{user.email}</strong>. Tu peux fermer cet onglet.
              </p>
              <Link href="/activity" className="btn-secondary mt-6">
                Aller au tableau de bord
              </Link>
            </div>
          ) : state.step === "waiting" ? (
            <div>
              <div className="text-center">
                <h1 className="display text-[24px]">Ouverture de SmartDemo…</h1>
                <p className="mt-2 text-ink-2">Si ton navigateur demande d&apos;ouvrir SmartDemo, accepte.</p>
                <Spinner className="py-6" />
                <a href={state.link} className="btn-primary">
                  Ouvrir SmartDemo
                </a>
              </div>
              {slow && (
                <div className="mt-6 space-y-3 rounded-lg bg-surface-2 p-4">
                  <p className="text-[13px] text-ink-2">
                    Rien ne se passe ? Dans la fenêtre de connexion de SmartDemo, choisis <strong className="font-medium text-ink">Avec un token</strong> et colle :
                  </p>
                  <Field label="Adresse du serveur" value={server} />
                  <Field label="Token" value={state.token} />
                </div>
              )}
            </div>
          ) : (
            <div className="text-center">
              <h1 className="display text-[24px]">Connecter {device}</h1>
              <p className="mt-2 text-ink-2">
                SmartDemo pourra envoyer les enregistrements que tu choisis de partager sur le compte{" "}
                <strong className="font-medium text-ink">{user.email}</strong>.
              </p>
              {error && (
                <div className="mt-4 text-left">
                  <ErrorNote>{error}</ErrorNote>
                </div>
              )}
              <button className="btn-primary mt-6 h-10 w-full" onClick={authorize} disabled={state.step === "creating"}>
                {state.step === "creating" ? "…" : "Autoriser et ouvrir SmartDemo"}
              </button>
              <p className="mt-3 text-xs text-ink-3">Tu pourras déconnecter cet appareil à tout moment dans Réglages.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex gap-2">
        <code className="tc flex h-9 min-w-0 flex-1 items-center truncate rounded-lg border border-border bg-surface px-3 text-xs">{value}</code>
        <CopyButton text={value} label="Copier" iconOnly className="btn-icon btn-secondary size-9" />
      </div>
    </div>
  );
}
