"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Logo, Spinner } from "@/components/ui";
import { api, ApiError, type User } from "@/lib/api";

const SessionContext = createContext<{ user: User; setUser: (u: User) => void } | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside AppShell");
  return ctx;
}

/** Signed-in area: checks the session, then renders the top bar and the page. */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    api<{ user: User }>("/auth/me")
      .then((r) => setUser(r.user))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
      });
  }, [router]);

  if (!user) return <Spinner />;

  const nav = [
    { href: "/videos", label: "Vidéos" },
    { href: "/settings", label: "Réglages" },
  ];

  return (
    <SessionContext.Provider value={{ user, setUser }}>
      <header className="sticky top-0 z-10 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6">
          <Logo compact />
          <nav className="flex gap-1">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-1.5 text-sm ${pathname.startsWith(n.href) ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:text-ink"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-ink-2 sm:inline">{user.name || user.email}</span>
            <button
              className="text-ink-2 hover:text-ink"
              onClick={async () => {
                await api("/auth/logout", { method: "POST" });
                router.replace("/login");
              }}
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </SessionContext.Provider>
  );
}
