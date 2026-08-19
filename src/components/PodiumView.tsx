"use client";

import { Medal, Trophy } from "lucide-react";
import { computeKnockoutPlacements } from "@/lib/bracket";
import { StandingsTable } from "@/components/StandingsTable";
import type { LeagueView } from "@/lib/tournament";

const PODIUM_STYLE = {
  1: {
    label: "1st",
    emoji: "🥇",
    height: "h-28 sm:h-36",
    surface: "from-amber-300 to-amber-500 text-navy-900",
    ring: "ring-amber-300/60",
  },
  2: {
    label: "2nd",
    emoji: "🥈",
    height: "h-20 sm:h-26",
    surface: "from-slate-200 to-slate-400 text-navy-900",
    ring: "ring-slate-300/50",
  },
  3: {
    label: "3rd",
    emoji: "🥉",
    height: "h-16 sm:h-20",
    surface: "from-orange-300 to-orange-500 text-navy-900",
    ring: "ring-orange-300/50",
  },
} as const;

/**
 * Permanent results page. Everything on it is derived from stored match
 * results, so it survives a refresh without needing its own saved copy.
 */
export function PodiumView({ view }: { view: LeagueView }) {
  const { podium, standings, bracket, bracketMatches, playersById, tournament } = view;

  const byPlace = new Map(podium.map((p) => [p.place, p]));
  // Silver sits left of gold, bronze right - the usual podium arrangement.
  const order: Array<2 | 1 | 3> = podium.some((p) => p.place === 3) ? [2, 1, 3] : [2, 1];

  const placements =
    bracket && tournament.mode === "KNOCKOUT"
      ? computeKnockoutPlacements(bracketMatches, bracket.size, playersById, bracket.participants)
      : [];

  return (
    <div className="space-y-10">
      <header className="rise-in text-center">
        <p className="eyebrow text-[11px] font-semibold text-royal-300/80">
          Yassin&rsquo;s League
        </p>
        <h1 className="title-display mt-2 text-4xl text-white sm:text-5xl">FINAL RESULTS</h1>
        <div className="mx-auto mt-4 h-px w-24 bg-gradient-to-r from-transparent via-royal-400 to-transparent" />
      </header>

      <section aria-label="Podium" className="rise-in">
        <div className="mx-auto flex max-w-2xl items-end justify-center gap-3 sm:gap-5">
          {order.map((place) => {
            const entry = byPlace.get(place);
            const style = PODIUM_STYLE[place];
            if (!entry) return null;
            return (
              <div key={place} className="flex w-1/3 flex-col items-center">
                {place === 1 && (
                  <Trophy className="mb-2 h-8 w-8 text-amber-300" aria-hidden />
                )}
                <span className="mb-2 text-2xl" aria-hidden>
                  {style.emoji}
                </span>
                <p
                  className="mb-2 w-full truncate text-center text-sm font-bold text-white sm:text-base"
                  title={entry.playerName}
                >
                  {entry.playerName}
                </p>
                <div
                  className={`flex w-full items-start justify-center rounded-t-xl bg-gradient-to-b pt-2 ring-1 ring-inset ${style.height} ${style.surface} ${style.ring}`}
                >
                  <span className="text-xl font-black tracking-tight sm:text-2xl">
                    {style.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mx-auto max-w-2xl border-t border-white/15" />
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-royal-300/80">
          <Medal className="h-4 w-4" aria-hidden />
          {tournament.mode === "KNOCKOUT" ? "Final placings" : "Final league table"}
        </h2>

        {tournament.mode === "KNOCKOUT" ? (
          <div className="scroll-x rounded-2xl border border-white/10 bg-white/[0.03]">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-royal-300/70">
                  <th scope="col" className="w-16 px-3 py-3 text-left font-semibold">
                    #
                  </th>
                  <th scope="col" className="px-3 py-3 text-left font-semibold">
                    Player
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                    Result
                  </th>
                </tr>
              </thead>
              <tbody>
                {placements.map((row, i) => (
                  <tr key={row.playerId} className="border-b border-white/5 last:border-0">
                    <td className="px-3 py-2.5 text-white/45 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2.5 font-medium text-white">{row.playerName}</td>
                    <td className="px-3 py-2.5 text-right text-white/70">{row.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <StandingsTable
            standings={standings}
            highlightIds={new Set(podium.map((p) => p.playerId))}
          />
        )}
      </section>
    </div>
  );
}
