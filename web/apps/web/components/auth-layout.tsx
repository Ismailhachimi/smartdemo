"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LiveDot, Logo, Viewfinder } from "@/components/ui";

/** Sign-in screens: a dark "monitor" on the left (desktop), the form on the right. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="stage relative hidden overflow-hidden bg-bg text-ink lg:block">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(60% 50% at 30% 35%, rgb(91 63 240 / 0.35), transparent 70%), radial-gradient(40% 40% at 75% 75%, rgb(229 52 63 / 0.18), transparent 70%)",
          }}
        />
        <div className="relative flex h-full flex-col p-10">
          <Logo href="/login" />
          <div className="relative my-auto aspect-video w-full max-w-xl self-center">
            <Viewfinder inset={0} size={28} />
            <Rec />
            <div className="flex h-full flex-col justify-center px-12">
              <p className="display text-[40px] leading-[1.05] xl:text-[46px]">
                Des démos qu&apos;on regarde jusqu&apos;au bout.
              </p>
              <p className="mt-4 max-w-sm text-[15px] text-ink-2">
                Enregistre sur ton Mac, envoie un lien par prospect, vois qui a regardé et où il a décroché.
              </p>
            </div>
          </div>
          <p className="text-xs text-ink-3">Auto-hébergé · tes vidéos restent sur ton serveur.</p>
        </div>
      </div>

      <div className="flex flex-col px-6 py-8 sm:px-10">
        <div className="lg:hidden">
          <Logo href="/login" />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">{children}</div>
      </div>
    </main>
  );
}

/** A running "REC 00:00:07" readout, like a camera monitor. */
function Rec() {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const tc = [Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60].map((n) => String(n).padStart(2, "0")).join(":");
  return (
    <div className="tc absolute top-5 right-6 flex items-center gap-2 text-xs text-ink-2" aria-hidden="true">
      <LiveDot />
      REC <span className="text-ink">{tc}</span>
    </div>
  );
}
