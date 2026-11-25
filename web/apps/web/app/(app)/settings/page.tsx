"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { IconLaptop } from "@/components/icons";
import { useSession } from "@/components/session";
import { CopyButton, ErrorNote, PageHeader } from "@/components/ui";
import { api, type User } from "@/lib/api";
import { timeAgo } from "@/lib/format";

export default function SettingsPage() {
  const { user, setUser, tokens, reloadTokens } = useSession();
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const server = typeof window === "undefined" ? "" : window.location.origin;

  async function createToken() {
    setError(null);
    try {
      const r = await api<{ token: string }>("/tokens", { method: "POST", json: { name: "Token manuel" } });
      setFresh(r.token);
      reloadTokens();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="Réglages" />

      <div className="divide-y divide-border border-t border-border">
        <Row
          id="mac"
          title="App Mac"
          description="SmartDemo envoie ici les enregistrements que tu choisis de partager. Rien ne part sans ton action."
        >
          <div className="flex flex-wrap gap-2">
            <Link href="/connect" className="btn-primary">
              <IconLaptop /> Connecter un Mac
            </Link>
            <button className="btn-secondary" onClick={createToken}>
              Créer un token
            </button>
          </div>
          {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
          {fresh && (
            <div className="mt-4 space-y-3 rounded-lg bg-surface-2 p-4">
              <p className="text-[13px] text-ink-2">
                Dans SmartDemo, choisis <strong className="font-medium text-ink">Partage → Connecter un serveur…</strong>, puis <strong className="font-medium text-ink">Avec un token</strong>, et colle ces deux valeurs. Le token ne sera plus affiché.
              </p>
              <Field label="Adresse du serveur" value={server} />
              <Field label="Token" value={fresh} />
            </div>
          )}
          {tokens && tokens.length > 0 && (
            <div className="mt-6">
              <div className="eyebrow mb-2">Appareils connectés</div>
              <ul className="panel divide-y divide-border">
                {tokens.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <IconLaptop className="size-5 shrink-0 text-ink-3" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{t.name}</div>
                      <div className="truncate text-xs text-ink-3">
                        <span className="tc">{t.prefix}…</span> · ajouté {timeAgo(t.createdAt)} · {t.lastUsedAt ? `actif ${timeAgo(t.lastUsedAt)}` : "jamais utilisé"}
                      </div>
                    </div>
                    <button
                      className="btn-danger btn-sm"
                      onClick={async () => {
                        if (!confirm("Déconnecter cet appareil ? Il ne pourra plus envoyer de vidéos.")) return;
                        await api(`/tokens/${t.id}`, { method: "DELETE" });
                        reloadTokens();
                      }}
                    >
                      Déconnecter
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Row>

        <Row title="Profil" description="Ton nom apparaît sur la page que reçoivent tes prospects.">
          <ProfileForm user={user} onSaved={setUser} />
        </Row>

        <Row title="Serveur" description="L'adresse à renseigner dans l'app Mac si tu la configures à la main.">
          <Field value={server} />
        </Row>
      </div>
    </div>
  );
}

function Row({ id, title, description, children }: { id?: string; title: string; description: string; children: ReactNode }) {
  return (
    <section id={id} className="grid scroll-mt-24 gap-4 py-8 md:grid-cols-[240px_1fr] md:gap-10">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <p className="mt-1 text-[13px] text-ink-2">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function ProfileForm({ user, onSaved }: { user: User; onSaved: (u: User) => void }) {
  const [name, setName] = useState(user.name ?? "");
  const [saved, setSaved] = useState(false);
  const dirty = name.trim() !== (user.name ?? "");
  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await api<{ user: User }>("/auth/me", { method: "PATCH", json: { name: name.trim() || null } });
        onSaved(r.user);
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
      }}
    >
      <div>
        <label className="label" htmlFor="name">Nom</label>
        <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom Nom" />
        <p className="mt-1.5 text-xs text-ink-3">
          Aperçu : « {name.trim() || "Quelqu'un"} t&apos;a envoyé une vidéo »
        </p>
      </div>
      <div>
        <div className="label">Email</div>
        <div className="flex h-9 items-center text-[13px] text-ink-2">
          {user.email}
          {user.role === "admin" && <span className="chip ml-2">Admin</span>}
        </div>
      </div>
      <button className="btn-secondary" disabled={!dirty && !saved}>
        {saved ? "Enregistré" : "Enregistrer"}
      </button>
    </form>
  );
}

function Field({ label, value }: { label?: string; value: string }) {
  return (
    <div>
      {label && <div className="label">{label}</div>}
      <div className="flex max-w-xl gap-2">
        <code className="tc flex h-9 min-w-0 flex-1 items-center truncate rounded-lg border border-border bg-surface px-3 text-xs">{value}</code>
        <CopyButton text={value} label="Copier" />
      </div>
    </div>
  );
}
