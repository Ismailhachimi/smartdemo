"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

export function Logo({ href = "/videos", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 font-semibold tracking-tight">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.png" alt="" width={28} height={28} className="rounded-lg" />
      <span className={compact ? "hidden sm:inline" : undefined}>SmartDemo</span>
    </Link>
  );
}

export function CopyButton({ text, label = "Copier le lien", className = "btn-ghost" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? "✓ Copié" : label}
    </button>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-ink-2">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-20" role="status" aria-label="Chargement">
      <div className="size-6 animate-spin rounded-full border-2 border-border border-t-brand" />
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-sm text-danger">{children}</p>;
}
