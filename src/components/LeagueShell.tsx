"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { Badge } from "@/components/ui";
import { statusLabel } from "@/lib/tournament";
import type { DerivedStatus } from "@/lib/types";

export type TabKey = "group" | "matches" | "bracket" | "results";

export const TAB_LABELS: Record<TabKey, string> = {
  group: "GROUP",
  matches: "MATCHES",
  bracket: "BRACKET",
  results: "RESULTS",
};

export function AppHeader({
  role,
  status,
  actions,
}: {
  role: "Admin" | "Player";
  status: DerivedStatus;
  actions?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-navy-950/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-royal-500/40 to-violet-glow/25 ring-1 ring-inset ring-white/15">
            <Trophy className="h-4 w-4 text-royal-300" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="title-display block truncate text-sm text-white sm:text-base">
              YASSIN&rsquo;S LEAGUE
            </span>
            <span className="block text-[10px] uppercase tracking-[0.18em] text-royal-300/60">
              Tournament Manager
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Badge tone={role === "Admin" ? "default" : "muted"}>{role} view</Badge>
          <Badge tone={status === "FINISHED" ? "gold" : "muted"}>{statusLabel(status)}</Badge>
        </div>

        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
    </header>
  );
}

export function TabBar({
  tabs,
  active,
  onChange,
  disabledTabs,
  disabledHint,
}: {
  tabs: TabKey[];
  active: TabKey;
  onChange: (tab: TabKey) => void;
  disabledTabs?: Partial<Record<TabKey, boolean>>;
  disabledHint?: string;
}) {
  return (
    <div role="tablist" aria-label="Tournament sections" className="scroll-x -mx-1 flex gap-1 px-1">
      {tabs.map((tab) => {
        const disabled = !!disabledTabs?.[tab];
        const isActive = active === tab && !disabled;
        return (
          <button
            key={tab}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-disabled={disabled || undefined}
            title={disabled ? disabledHint : undefined}
            disabled={disabled}
            onClick={() => onChange(tab)}
            className={`relative shrink-0 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors sm:text-sm ${
              isActive
                ? "bg-white/10 text-white ring-1 ring-inset ring-royal-400/40"
                : disabled
                  ? "cursor-not-allowed text-white/25"
                  : "text-white/55 hover:bg-white/5 hover:text-white"
            }`}
          >
            {TAB_LABELS[tab]}
            {isActive && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-royal-400" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function PageWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
  );
}
