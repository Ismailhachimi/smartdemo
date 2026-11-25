"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { IconCheck, IconCopy } from "@/components/icons";
import { formatDuration } from "@/lib/format";

// ---- Brand ---------------------------------------------------------------------------------

/**
 * The mark: two opposite viewfinder corners framing a record dot, on a violet tile.
 * Same drawing as app/icon.svg (favicon) and public/icon.png (emails).
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6a4dff" />
          <stop offset="1" stopColor="#3b1fd6" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}g)`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill={`url(#${id}s)`} stroke="#fff" strokeOpacity="0.14" />
      <path
        d="M8.5 14.5V11a2.5 2.5 0 0 1 2.5-2.5h3.5M23.5 17.5V21a2.5 2.5 0 0 1-2.5 2.5h-3.5"
        stroke="#fff"
        strokeWidth="2.8"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="16" cy="16" r="3.3" fill="#ff4d58" />
    </svg>
  );
}

/** Mark + lowercase wordmark. */
export function Logo({ href = "/activity", size = 26 }: { href?: string; size?: number }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-md" aria-label="SmartDemo">
      <LogoMark size={size} />
      <span className="font-display text-[19px] leading-none font-bold tracking-[-0.045em]" aria-hidden="true">
        smartdemo
      </span>
    </Link>
  );
}

/** Amber corner brackets, as in a camera viewfinder. Place inside a `relative` box. */
export function Viewfinder({ inset = 8, size = 14, className = "" }: { inset?: number; size?: number; className?: string }) {
  const corner = "absolute border-amber";
  const s = { width: size, height: size };
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute ${className}`} style={{ inset }}>
      <span className={`${corner} top-0 left-0 rounded-tl-[3px] border-t-2 border-l-2`} style={s} />
      <span className={`${corner} top-0 right-0 rounded-tr-[3px] border-t-2 border-r-2`} style={s} />
      <span className={`${corner} bottom-0 left-0 rounded-bl-[3px] border-b-2 border-l-2`} style={s} />
      <span className={`${corner} right-0 bottom-0 rounded-br-[3px] border-r-2 border-b-2`} style={s} />
    </span>
  );
}

/**
 * Page backdrop: a dot grid and a violet glow at the top that fade out before the content
 * gets dense. Needs a `relative isolate` parent.
 */
export function Backdrop({ className = "h-[520px]" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden ${className}`}>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(var(--color-grid) 1px, transparent 1.2px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(ellipse 75% 70% at 50% 0%, #000 25%, transparent 80%)",
        }}
      />
      <div className="absolute -top-56 left-1/2 h-[440px] w-[min(1000px,140%)] -translate-x-1/2 rounded-full bg-brand opacity-[0.12] blur-[110px] dark:opacity-[0.16]" />
      <div className="absolute -top-40 left-[62%] h-[260px] w-[420px] -translate-x-1/2 rounded-full bg-rec opacity-[0.05] blur-[100px] dark:opacity-[0.08]" />
    </div>
  );
}

export function LiveDot({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block size-2 shrink-0 animate-rec rounded-full bg-rec ${className}`} />;
}

// ---- Layout --------------------------------------------------------------------------------

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="display text-[28px] sm:text-[32px]">{title}</h1>
        {description && <p className="mt-1.5 text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, description, actions, children, className = "" }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-ink-2">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
      {icon && <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface-2 text-ink-2 [&_svg]:size-5">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <p className="mt-1 max-w-sm text-[13px] text-ink-2">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---- Data ----------------------------------------------------------------------------------

export interface Kpi {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}

/** A row of headline numbers sharing one frame, split by hairlines. */
export function KpiRow({ items }: { items: Kpi[] }) {
  return (
    <dl className={`grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border ${items.length > 4 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
      {items.map((k) => (
        <div key={k.label} className="bg-surface px-4 py-3.5 last:odd:col-span-2 sm:last:odd:col-span-1">
          <dt className="text-xs text-ink-2">{k.label}</dt>
          <dd className="display mt-1.5 text-[26px] tabular-nums">{k.value}</dd>
          {k.hint && <dd className="mt-1 text-xs text-ink-3">{k.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function Meter({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={`block h-1 overflow-hidden rounded-full bg-surface-3 ${className}`} role="meter" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(value > 0 ? 3 : 0, value * 100)}%` }} />
    </span>
  );
}

/** Video thumbnail with a duration timecode and, optionally, how much was watched. */
export function Thumb({
  src,
  durationSec,
  watched,
  className = "",
  children,
}: {
  src: string | null;
  durationSec?: number | null;
  watched?: number;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`relative aspect-video overflow-hidden rounded-lg bg-surface-3 ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center">
          <LogoMark size={22} />
        </div>
      )}
      {durationSec != null && (
        <span className="tc absolute right-1.5 bottom-1.5 rounded-[4px] bg-black/75 px-1 py-px text-[10px] font-medium text-white">
          {formatDuration(durationSec)}
        </span>
      )}
      {watched != null && (
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
          <span className="block h-full bg-rec" style={{ width: `${watched * 100}%` }} />
        </span>
      )}
      {children}
    </div>
  );
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials || "?"}
    </span>
  );
}

// ---- Controls ------------------------------------------------------------------------------

export function useCopy(timeout = 1600) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    copied,
    copy: async (text: string) => {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), timeout);
    },
  };
}

export function CopyButton({
  text,
  label = "Copier le lien",
  className = "btn-secondary",
  iconOnly = false,
}: {
  text: string;
  label?: string;
  className?: string;
  iconOnly?: boolean;
}) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      className={className}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void copy(text);
      }}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
    >
      {copied ? <IconCheck className="text-good" /> : <IconCopy />}
      {!iconOnly && (copied ? "Copié" : label)}
    </button>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-brand" : "bg-surface-3"}`}
    >
      <span className={`size-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  );
}

/** Small popover menu. Items get a `close` callback. */
export function Menu({ label, trigger, children, align = "right" }: { label: string; trigger: ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="btn-icon btn-ghost"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-30 mt-1 min-w-52 rounded-lg border border-border bg-surface p-1 shadow-[0_8px_30px_rgb(0_0_0/0.12)] ${align === "right" ? "right-0" : "left-0"}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ onClick, children, danger }: { onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] [&_svg]:size-4 [&_svg]:shrink-0 ${danger ? "text-danger hover:bg-danger/10" : "text-ink hover:bg-surface-2 [&_svg]:text-ink-2"}`}
    >
      {children}
    </button>
  );
}

// ---- Feedback ------------------------------------------------------------------------------

export function Spinner({ className = "py-24" }: { className?: string }) {
  return (
    <div className={`flex justify-center ${className}`} role="status" aria-label="Chargement">
      <div className="size-5 animate-spin rounded-full border-2 border-border-strong border-t-ink" />
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-danger/25 bg-danger/[0.06] px-3 py-2 text-[13px] text-danger">{children}</p>;
}
