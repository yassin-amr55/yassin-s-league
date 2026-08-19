"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ListOrdered, Search } from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/ui";
import { groupByMatchday, isMatchCompleted } from "@/lib/schedule";
import type { Match, Player, ResolvedBracketMatch } from "@/lib/types";

/** Above this many fixtures the "all matchdays" view is not offered. */
const SHOW_ALL_LIMIT = 240;
const SEARCH_LIMIT = 120;

interface MatchRowProps {
  number: number;
  context: string;
  nameA: string;
  nameB: string;
  scoreA: number | null;
  scoreB: number | null;
  completed: boolean;
  playable: boolean;
  readOnly: boolean;
  note?: string;
  onSelect?: () => void;
}

function MatchRow({
  number,
  context,
  nameA,
  nameB,
  scoreA,
  scoreB,
  completed,
  playable,
  readOnly,
  note,
  onSelect,
}: MatchRowProps) {
  const interactive = !readOnly && playable && !!onSelect;
  const winnerA = completed && scoreA !== null && scoreB !== null && scoreA > scoreB;
  const winnerB = completed && scoreA !== null && scoreB !== null && scoreB > scoreA;

  const content = (
    <>
      <div className="flex w-full items-center gap-3 sm:w-auto sm:min-w-[150px]">
        <span className="inline-flex h-7 min-w-[2.75rem] items-center justify-center rounded-md bg-white/8 px-2 text-xs font-bold tabular-nums text-royal-200">
          #{number}
        </span>
        <span className="truncate text-[11px] uppercase tracking-wider text-white/40">
          {context}
        </span>
      </div>

      <div className="flex flex-1 items-center gap-3">
        <span
          className={`min-w-0 flex-1 truncate text-right ${
            winnerA ? "font-bold text-white" : "font-medium text-white/80"
          }`}
        >
          {nameA}
        </span>
        <span
          className={`shrink-0 rounded-lg px-3 py-1 text-sm font-bold tabular-nums ${
            completed ? "bg-royal-500/25 text-white" : "bg-white/6 text-white/35"
          }`}
        >
          {completed ? `${scoreA} - ${scoreB}` : "vs"}
        </span>
        <span
          className={`min-w-0 flex-1 truncate ${
            winnerB ? "font-bold text-white" : "font-medium text-white/80"
          }`}
        >
          {nameB}
        </span>
      </div>

      <div className="flex w-full justify-end sm:w-32">
        {note ? (
          <Badge tone="muted">{note}</Badge>
        ) : completed ? (
          <Badge tone="success">Completed</Badge>
        ) : (
          <Badge tone="muted">Not played</Badge>
        )}
      </div>
    </>
  );

  const base =
    "flex w-full flex-col gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm sm:flex-row sm:items-center sm:gap-4";

  if (!interactive) {
    return <div className={base}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Enter result for match ${number}: ${nameA} versus ${nameB}`}
      className={`${base} cursor-pointer text-left transition-colors hover:border-royal-400/40 hover:bg-royal-500/10`}
    >
      {content}
    </button>
  );
}

/* --------------------------------------------------------- group fixtures */

export function GroupMatches({
  matches,
  playersById,
  readOnly,
  onSelect,
}: {
  matches: Match[];
  playersById: Map<string, Player>;
  readOnly: boolean;
  onSelect?: (match: Match) => void;
}) {
  const days = useMemo(() => groupByMatchday(matches), [matches]);
  const [dayIndex, setDayIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");

  const nameOf = (id: string) => playersById.get(id)?.name ?? "Unknown player";
  const played = matches.filter(isMatchCompleted).length;
  const canShowAll = matches.length <= SHOW_ALL_LIMIT;
  const safeIndex = Math.min(dayIndex, Math.max(days.length - 1, 0));

  const searching = query.trim().length > 0;
  const searchResults = useMemo(() => {
    if (!searching) return [];
    const q = query.trim().toLowerCase();
    return matches
      .filter(
        (m) =>
          nameOf(m.playerAId).toLowerCase().includes(q) ||
          nameOf(m.playerBId).toLowerCase().includes(q) ||
          String(m.index) === q,
      )
      .slice(0, SEARCH_LIMIT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, matches, playersById]);

  if (matches.length === 0) {
    return (
      <EmptyState icon={<ListOrdered className="h-7 w-7" />} title="No fixtures yet">
        {readOnly
          ? "The admin has not organised the fixtures yet. They will appear here automatically."
          : 'Use "Organise matches" to generate the full round-robin schedule.'}
      </EmptyState>
    );
  }

  const visibleDays = searching ? [] : showAll ? days : [days[safeIndex]];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-royal-200">
          <CalendarDays className="h-4 w-4" aria-hidden />
          <span className="tabular-nums">
            {played} of {matches.length} fixtures played
          </span>
          <span className="text-white/30">|</span>
          <span className="tabular-nums text-white/50">{days.length} matchdays</span>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player or match #"
            aria-label="Search fixtures"
            className="h-9 w-56 rounded-lg border border-white/12 bg-navy-950/60 pl-9 pr-3 text-sm text-white placeholder:text-white/25 focus:border-royal-400 focus:outline-none"
          />
        </div>
      </div>

      {!searching && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setDayIndex((i) => Math.max(0, i - 1))}
            disabled={showAll || safeIndex === 0}
            aria-label="Previous matchday"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Prev
          </Button>

          <label className="sr-only" htmlFor="matchday-select">
            Matchday
          </label>
          <select
            id="matchday-select"
            value={safeIndex}
            disabled={showAll}
            onChange={(e) => setDayIndex(Number(e.target.value))}
            className="h-8 rounded-lg border border-white/12 bg-navy-950/60 px-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {days.map((d, i) => (
              <option key={d.matchday} value={i} className="bg-navy-900">
                Matchday {d.matchday}
              </option>
            ))}
          </select>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => setDayIndex((i) => Math.min(days.length - 1, i + 1))}
            disabled={showAll || safeIndex >= days.length - 1}
            aria-label="Next matchday"
          >
            Next
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>

          {canShowAll ? (
            <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show one matchday" : "Show all matchdays"}
            </Button>
          ) : (
            <span className="text-xs text-white/35">
              Large league - fixtures are shown one matchday at a time.
            </span>
          )}
        </div>
      )}

      {searching ? (
        <div className="space-y-4">
          <p className="text-sm text-royal-300/80">
            {searchResults.length === 0
              ? "No fixtures match that search."
              : `${searchResults.length} matching ${
                  searchResults.length === 1 ? "fixture" : "fixtures"
                }${searchResults.length === SEARCH_LIMIT ? " (showing the first " + SEARCH_LIMIT + ")" : ""}`}
          </p>
          <div className="space-y-2">
            {searchResults.map((m) => (
              <MatchRow
                key={m.id}
                number={m.index}
                context={`Matchday ${m.matchday}`}
                nameA={nameOf(m.playerAId)}
                nameB={nameOf(m.playerBId)}
                scoreA={m.scoreA}
                scoreB={m.scoreB}
                completed={isMatchCompleted(m)}
                playable
                readOnly={readOnly}
                onSelect={() => onSelect?.(m)}
              />
            ))}
          </div>
        </div>
      ) : (
        visibleDays.map((day) => (
          <section key={day.matchday} className="space-y-2">
            <h3 className="flex items-baseline gap-2 pt-2 text-sm font-bold uppercase tracking-wider text-white">
              Matchday {day.matchday}
              <span className="text-xs font-normal normal-case tracking-normal text-white/35">
                {day.matches.filter(isMatchCompleted).length}/{day.matches.length} played
              </span>
            </h3>
            {day.matches.map((m) => (
              <MatchRow
                key={m.id}
                number={m.index}
                context={`Matchday ${m.matchday}`}
                nameA={nameOf(m.playerAId)}
                nameB={nameOf(m.playerBId)}
                scoreA={m.scoreA}
                scoreB={m.scoreB}
                completed={isMatchCompleted(m)}
                playable
                readOnly={readOnly}
                onSelect={() => onSelect?.(m)}
              />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

/* -------------------------------------------------------- knockout ties */

export function KnockoutMatches({
  matches,
  readOnly,
  onSelect,
}: {
  matches: ResolvedBracketMatch[];
  readOnly: boolean;
  onSelect?: (match: ResolvedBracketMatch) => void;
}) {
  if (matches.length === 0) {
    return (
      <EmptyState icon={<ListOrdered className="h-7 w-7" />} title="No knockout ties yet">
        {readOnly
          ? "The bracket has not been organised yet."
          : 'Open the Bracket tab and use "Organise matches" to draw the knockout rounds.'}
      </EmptyState>
    );
  }

  const rounds: Array<{ name: string; matches: ResolvedBracketMatch[] }> = [];
  for (const m of matches) {
    const last = rounds[rounds.length - 1];
    if (last && last.name === m.roundName) last.matches.push(m);
    else rounds.push({ name: m.roundName, matches: [m] });
  }

  return (
    <div className="space-y-5">
      {rounds.map((round) => (
        <section key={round.name} className="space-y-2">
          <h3 className="flex items-baseline gap-2 text-sm font-bold uppercase tracking-wider text-white">
            {round.name}
            <span className="text-xs font-normal normal-case tracking-normal text-white/35">
              {round.matches.filter((m) => m.completed).length}/{round.matches.length} played
            </span>
          </h3>
          {round.matches.map((m) => {
            const ready = !!m.playerAId && !!m.playerBId;
            return (
              <MatchRow
                key={m.id}
                number={m.matchNumber}
                context={m.roundName}
                nameA={m.labelA}
                nameB={m.labelB}
                scoreA={m.result?.aGoals ?? null}
                scoreB={m.result?.bGoals ?? null}
                completed={m.completed}
                playable={ready}
                readOnly={readOnly}
                note={ready ? undefined : "Awaiting players"}
                onSelect={() => onSelect?.(m)}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
