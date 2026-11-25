"use client";

import { useState, type FormEvent } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { IconArrowLeft, IconMail } from "@/components/icons";
import { ErrorNote } from "@/components/ui";
import { api } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setState("sending");
    try {
      await api("/auth/magic-link", { method: "POST", json: { email } });
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  return (
    <AuthLayout>
      {state === "sent" ? (
        <div>
          <div className="flex size-11 items-center justify-center rounded-full bg-brand-soft text-brand [&_svg]:size-5">
            <IconMail />
          </div>
          <h1 className="display mt-5 text-[28px]">Vérifie ta boîte mail</h1>
          <p className="mt-2 text-ink-2">
            Un lien de connexion vient de partir vers <strong className="font-medium text-ink">{email}</strong>. Il est valable 15 minutes.
          </p>
          <p className="mt-6 rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-ink-2">
            Pas d&apos;email configuré sur ce serveur ? Le lien est affiché dans les logs de l&apos;API.
          </p>
          <button className="btn-ghost mt-6 -ml-3" onClick={() => setState("idle")}>
            <IconArrowLeft /> Utiliser une autre adresse
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <h1 className="display text-[28px]">Connexion</h1>
          <p className="mt-2 text-ink-2">Pas de mot de passe : on t&apos;envoie un lien par email.</p>
          <div className="mt-8">
            <label className="label" htmlFor="email">
              Email professionnel
            </label>
            <input
              id="email"
              className="input h-10"
              type="email"
              autoComplete="email"
              required
              autoFocus
              placeholder="toi@entreprise.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
          <button className="btn-primary mt-4 h-10 w-full" disabled={state === "sending"}>
            {state === "sending" ? "Envoi…" : "Recevoir le lien"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
