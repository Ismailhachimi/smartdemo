"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { CopyButton, ErrorNote } from "@/components/ui";
import { api, type ApiToken, type User } from "@/lib/api";
import { timeAgo } from "@/lib/format";

export default function SettingsPage() {
  const { user, setUser } = useSession();
  const [name, setName] = useState(user.name ?? "");
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const server = typeof window === "undefined" ? "" : window.location.origin;

  const load = useCallback(() => {
    api<{ tokens: ApiToken[] }>("/tokens").then((r) => setTokens(r.tokens));
  }, []);
  useEffect(load, [load]);

  async function connectMac(open: boolean) {
    setError(null);
    try {
      const r = await api<{ token: string }>("/tokens", { method: "POST", json: { name: "SmartDemo pour Mac" } });
      setFresh(r.token);
      load();
      if (open) {
        window.location.href = `smartdemo://connect?server=${encodeURIComponent(server)}&token=${encodeURIComponent(r.token)}`;
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Réglages</h1>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Connecter l&apos;app Mac</h2>
          <p className="mt-1 text-sm text-ink-2">
            L&apos;app SmartDemo envoie tes enregistrements ici quand tu le décides. Les vidéos restent sur ton Mac tant que tu ne les envoies pas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => connectMac(true)}>
            Connecter l&apos;app Mac
          </button>
          <button className="btn-ghost" onClick={() => connectMac(false)}>
            Créer un token manuellement
          </button>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        {fresh && (
          <div className="space-y-3 rounded-xl bg-surface-2 p-4 text-sm">
            <p className="text-ink-2">
              Si l&apos;app ne s&apos;est pas ouverte, colle ces deux valeurs dans SmartDemo → <strong>Serveur…</strong>. Le token ne sera plus affiché.
            </p>
            <Field label="Adresse du serveur" value={server} />
            <Field label="Token" value={fresh} />
          </div>
        )}
        {tokens.length > 0 && (
          <ul className="divide-y divide-border text-sm">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-ink-2">
                    {t.prefix}… · créé {timeAgo(t.createdAt)} · {t.lastUsedAt ? `utilisé ${timeAgo(t.lastUsedAt)}` : "jamais utilisé"}
                  </div>
                </div>
                <button
                  className="btn-danger py-1.5 text-xs"
                  onClick={async () => {
                    if (!confirm("Révoquer ce token ? L'app qui l'utilise ne pourra plus envoyer de vidéos.")) return;
                    await api(`/tokens/${t.id}`, { method: "DELETE" });
                    load();
                  }}
                >
                  Révoquer
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">Profil</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await api<{ user: User }>("/auth/me", { method: "PATCH", json: { name: name.trim() || null } });
            setUser(r.user);
          }}
        >
          <div className="min-w-60 flex-1">
            <label className="label" htmlFor="name">
              Nom affiché
            </label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ton nom" />
          </div>
          <button className="btn-ghost">Enregistrer</button>
        </form>
        <p className="text-sm text-ink-2">
          Connecté en tant que <strong className="text-ink">{user.email}</strong>
          {user.role === "admin" ? " · administrateur" : ""}
        </p>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex gap-2">
        <code className="input flex-1 truncate font-mono text-xs">{value}</code>
        <CopyButton text={value} label="Copier" className="btn-ghost py-1.5 text-xs" />
      </div>
    </div>
  );
}
