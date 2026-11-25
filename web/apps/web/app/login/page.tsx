"use client";

import { useState, type FormEvent } from "react";
import { ErrorNote, Logo } from "@/components/ui";
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
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo href="/login" />
        </div>
        <div className="card p-6">
          {state === "sent" ? (
            <div className="text-center">
              <div className="text-3xl">📬</div>
              <h1 className="mt-3 text-lg font-semibold">Vérifie ta boîte mail</h1>
              <p className="mt-2 text-sm text-ink-2">
                Un lien de connexion a été envoyé à <strong className="text-ink">{email}</strong>. Il est valable 15 minutes.
              </p>
              <p className="mt-4 text-xs text-ink-3">
                Serveur sans email configuré ? Le lien s&apos;affiche dans les logs de l&apos;API.
              </p>
              <button className="btn-ghost mt-5 w-full" onClick={() => setState("idle")}>
                Utiliser une autre adresse
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h1 className="text-lg font-semibold">Connexion</h1>
                <p className="mt-1 text-sm text-ink-2">Pas de mot de passe : on t&apos;envoie un lien par email.</p>
              </div>
              <div>
                <label className="label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  required
                  autoFocus
                  placeholder="toi@entreprise.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error && <ErrorNote>{error}</ErrorNote>}
              <button className="btn-primary w-full" disabled={state === "sending"}>
                {state === "sending" ? "Envoi…" : "Recevoir le lien"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
