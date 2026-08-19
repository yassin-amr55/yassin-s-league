"use client";

import type { StandingRow } from "@/lib/types";

const COLUMNS: Array<{ key: keyof StandingRow | "position" | "playerName"; label: string; title: string }> = [
  { key: "played", label: "P", title: "Played" },
  { key: "wins", label: "W", title: "Wins" },
  { key: "draws", label: "D", title: "Draws" },
  { key: "losses", label: "L", title: "Losses" },
  { key: "goalsFor", label: "GF", title: "Goals for" },
  { key: "goalsAgainst", label: "GA", title: "Goals against" },
  { key: "goalDifference", label: "GD", title: "Goal difference" },
];

/**
 * Football-style league table. The `qualifyingCount` prop draws the cut-off line
 * so it is obvious who is currently heading for the knockout stage.
 */
export function StandingsTable({
  standings,
  qualifyingCount,
  highlightIds,
}: {
  standings: StandingRow[];
  qualifyingCount?: number | null;
  highlightIds?: ReadonlySet<string>;
}) {
  return (
    <div className="scroll-x rounded-2xl border border-white/10 bg-white/[0.03]">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-royal-300/70">
            <th scope="col" className="w-12 px-3 py-3 text-left font-semibold">
              #
            </th>
            <th scope="col" className="px-3 py-3 text-left font-semibold">
              Player
            </th>
            {COLUMNS.map((col) => (
              <th
                key={col.label}
                scope="col"
                title={col.title}
                className="w-12 px-2 py-3 text-center font-semibold"
              >
                <abbr title={col.title} className="no-underline">
                  {col.label}
                </abbr>
              </th>
            ))}
            <th scope="col" className="w-16 px-3 py-3 text-center font-semibold text-white">
              Pts
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => {
            const qualifies = !!qualifyingCount && row.position <= qualifyingCount;
            const isCutOff = !!qualifyingCount && row.position === qualifyingCount;
            return (
              <tr
                key={row.playerId}
                className={`border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.04] ${
                  isCutOff ? "border-b-2 border-b-royal-400/50" : ""
                } ${highlightIds?.has(row.playerId) ? "bg-royal-500/10" : ""}`}
              >
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${
                      qualifies
                        ? "bg-royal-500/25 text-royal-200 ring-1 ring-inset ring-royal-400/40"
                        : "text-white/45"
                    }`}
                  >
                    {row.position}
                  </span>
                </td>
                <td className="max-w-[220px] truncate px-3 py-2.5 font-medium text-white">
                  {row.playerName}
                </td>
                {COLUMNS.map((col) => (
                  <td
                    key={col.label}
                    className="px-2 py-2.5 text-center tabular-nums text-white/70"
                  >
                    {col.key === "goalDifference" && row.goalDifference > 0 ? "+" : ""}
                    {row[col.key as keyof StandingRow] as number}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-center text-base font-bold tabular-nums text-white">
                  {row.points}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
