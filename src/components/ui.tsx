"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

/* ---------------------------------------------------------------- Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-royal-400 to-royal-500 text-white shadow-lg shadow-royal-500/25 hover:from-royal-300 hover:to-royal-400 disabled:from-slate-600 disabled:to-slate-700 disabled:shadow-none",
  secondary:
    "bg-white/8 text-white ring-1 ring-inset ring-white/20 hover:bg-white/14 disabled:text-white/40",
  ghost: "text-royal-300 hover:text-white hover:bg-white/10 disabled:text-white/30",
  danger:
    "bg-red-500/90 text-white shadow-lg shadow-red-900/30 hover:bg-red-500 disabled:bg-red-500/40",
  gold: "bg-gradient-to-b from-amber-300 to-amber-500 text-navy-900 shadow-lg shadow-amber-500/25 hover:from-amber-200 hover:to-amber-400 disabled:from-slate-600 disabled:to-slate-700 disabled:text-white/50",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-7 text-sm gap-2.5 tracking-wide",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      // A busy button is disabled so a slow save cannot be fired twice.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-lg font-semibold transition-colors duration-150 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ Card */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-[2px] ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  hint,
  action,
}: {
  children: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="title-display text-xl text-white sm:text-2xl">{children}</h2>
        {hint && <p className="mt-1 text-sm text-royal-300/80">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/* ----------------------------------------------------------- Feedback UI */

export function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="alert"
      className="fade-in flex items-start gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" aria-hidden />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="rounded p-0.5 text-red-200 hover:bg-red-500/20 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-royal-400/25 bg-royal-500/10 px-4 py-3 text-sm text-royal-200">
      {children}
    </p>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-royal-300">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}...</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
      {icon && <div className="text-royal-400">{icon}</div>}
      <p className="text-base font-semibold text-white">{title}</p>
      {children && <div className="max-w-md text-sm text-royal-300/80">{children}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "success" | "muted" | "gold";
}) {
  const tones = {
    default: "bg-royal-500/20 text-royal-200 ring-royal-400/30",
    success: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30",
    muted: "bg-white/8 text-white/60 ring-white/15",
    gold: "bg-amber-400/15 text-amber-200 ring-amber-300/30",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- Modal */

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Held in a ref so the focus effect below can depend on `open` alone.
  // Callers pass inline arrow functions, whose identity changes on every render
  // of the parent - keeping `onClose` in the dependency list would re-run the
  // effect on every keystroke and steal focus back out of the field.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Escape closes; focus moves into the dialog so keyboard users are not
  // stranded behind it. This runs once per opening, never while typing.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      // Prefer a real field over the close button, which comes first in the DOM.
      const target =
        panel.querySelector<HTMLElement>("input:not([type='hidden']), textarea, select") ??
        panel.querySelector<HTMLElement>("button, [tabindex]:not([tabindex='-1'])");
      target?.focus();
    }, 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="fade-in absolute inset-0 bg-navy-950/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`rise-in relative w-full ${maxWidth} rounded-t-2xl border border-white/12 bg-navy-900 p-5 shadow-2xl shadow-black/60 sm:rounded-2xl sm:p-6`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="title-display text-lg text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1 rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
