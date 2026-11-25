"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { IconActivity, IconFilm, IconLaptop, IconLogout, IconSettings } from "@/components/icons";
import { Avatar, Backdrop, Logo, Menu, MenuItem, Spinner } from "@/components/ui";
import { api, ApiError, type ApiToken, type User } from "@/lib/api";
import { timeAgo } from "@/lib/format";

interface Session {
  user: User;
  setUser: (u: User) => void;
  /** Personal access tokens: one per connected Mac. */
  tokens: ApiToken[] | null;
  reloadTokens: () => void;
}

const SessionContext = createContext<Session | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside AppShell");
  return ctx;
}

const NAV = [
  { href: "/activity", label: "Activité", icon: IconActivity },
  { href: "/videos", label: "Vidéos", icon: IconFilm },
  { href: "/settings", label: "Réglages", icon: IconSettings },
];

/** Signed-in area: checks the session, then renders the navigation and the page. */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);

  useEffect(() => {
    api<{ user: User }>("/auth/me")
      .then((r) => setUser(r.user))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
      });
  }, [router]);

  const reloadTokens = useCallback(() => {
    api<{ tokens: ApiToken[] }>("/tokens")
      .then((r) => setTokens(r.tokens))
      .catch(() => setTokens([]));
  }, []);
  useEffect(() => {
    if (user) reloadTokens();
  }, [user, reloadTokens]);

  if (!user) return <Spinner className="h-dvh items-center" />;

  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login");
  };
  const displayName = user.name || user.email;
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <SessionContext.Provider value={{ user, setUser, tokens, reloadTokens }}>
      <div className="lg:grid lg:min-h-dvh lg:grid-cols-[248px_1fr]">
        {/* Sidebar (desktop) */}
        <aside className="sticky top-0 z-10 hidden h-dvh flex-col border-r border-border bg-sidebar px-3 py-5 lg:flex">
          <div className="px-2.5">
            <Logo />
          </div>
          <nav className="mt-8 space-y-0.5" aria-label="Navigation principale">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={active(href) ? "page" : undefined}
                className={`flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] transition-colors [&_svg]:size-[18px] ${
                  active(href) ? "bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--color-border)]" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <Icon />
                {label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto space-y-3">
            <MacStatus tokens={tokens} />
            <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5">
              <Avatar name={displayName} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{user.name || user.email.split("@")[0]}</div>
                <div className="truncate text-xs text-ink-3">{user.email}</div>
              </div>
              <button className="btn-icon btn-ghost" onClick={logout} aria-label="Se déconnecter" title="Se déconnecter">
                <IconLogout />
              </button>
            </div>
          </div>
        </aside>

        {/* Top bar (mobile, tablet) */}
        <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur-xl lg:hidden">
          <div className="flex h-14 items-center gap-3 px-4">
            <Logo />
            <div className="ml-auto">
              <Menu label="Compte" trigger={<Avatar name={displayName} size={26} />}>
                {(close) => (
                  <>
                    <div className="border-b border-border px-2.5 pt-1.5 pb-2.5 text-xs text-ink-2">{user.email}</div>
                    <MenuItem
                      onClick={() => {
                        close();
                        void logout();
                      }}
                    >
                      <IconLogout /> Se déconnecter
                    </MenuItem>
                  </>
                )}
              </Menu>
            </div>
          </div>
          <nav className="-mb-px flex gap-5 overflow-x-auto px-4" aria-label="Navigation principale">
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={active(href) ? "page" : undefined}
                className={`border-b-2 pb-2.5 text-[13.5px] whitespace-nowrap ${active(href) ? "border-ink font-medium text-ink" : "border-transparent text-ink-2"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </header>

        <div className="relative isolate min-w-0">
          <Backdrop />
          <main className="mx-auto w-full max-w-[1160px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</main>
        </div>
      </div>
    </SessionContext.Provider>
  );
}

function MacStatus({ tokens }: { tokens: ApiToken[] | null }) {
  if (!tokens) return null;
  const lastUsed = tokens
    .map((t) => t.lastUsedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const connected = tokens.length > 0;
  return (
    <Link href="/settings#mac" className="block rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:border-border-strong">
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <IconLaptop className="size-4 text-ink-2" />
        App Mac
        <span className={`ml-auto size-1.5 rounded-full ${connected ? "bg-good" : "bg-ink-3"}`} aria-hidden="true" />
      </div>
      <div className="mt-0.5 text-xs text-ink-3">
        {connected ? (lastUsed ? `Active ${timeAgo(lastUsed)}` : "Connectée, aucun envoi") : "Pas encore connectée"}
      </div>
    </Link>
  );
}
