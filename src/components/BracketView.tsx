"use client";

import { Trophy } from "lucide-react";
import { roundsFor } from "@/lib/bracket";
import type { ResolvedBracketMatch } from "@/lib/types";

/**
 * Champions-League-inspired bracket: rounds march inwards from both edges and
 * meet at the final in the middle, joined by drawn connector lines.
 *
 * Geometry note - every column body is given the same explicit height and each
 * tie inside it is a `flex-1` row. That makes the centre of tie 2i sit at 25%
 * of a connector block and tie 2i+1 at 75%, which is what lets the connectors
 * line up for every bracket size without any measuring.
 */
const COLUMN_WIDTH = 196;
const CONNECTOR_WIDTH = 26;
const ROW_HEIGHT = 104;
const HEADER_HEIGHT = 32;

const LINE = "border-white/20";

export function BracketView({
  matches,
  size,
  readOnly,
  onSelect,
}: {
  matches: ResolvedBracketMatch[];
  size: number;
  readOnly: boolean;
  onSelect?: (match: ResolvedBracketMatch) => void;
}) {
  const rounds = roundsFor(size);
  const main = matches.filter((m) => !m.isThirdPlace);
  const third = matches.find((m) => m.isThirdPlace);
  const byRound = Array.from({ length: rounds }, (_, r) =>
    main.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot),
  );
  const finalMatch = byRound[rounds - 1]?.[0];
  const bodyHeight = Math.max(1, size / 4) * ROW_HEIGHT;

  const cardProps = { readOnly, onSelect };

  // A two-player tournament is just the final.
  if (size === 2) {
    return (
      <div className="scroll-x pb-4">
        <div className="mx-auto flex w-max flex-col items-center gap-4 px-4 py-6">
          <RoundLabel>Final</RoundLabel>
          <div style={{ width: COLUMN_WIDTH }}>
            {finalMatch && <BracketCard match={finalMatch} isFinal {...cardProps} />}
          </div>
        </div>
      </div>
    );
  }

  const outerRounds = rounds - 1; // every round except the final
  const leftRounds = byRound.slice(0, outerRounds).map((list) => list.slice(0, list.length / 2));
  const rightRounds = byRound.slice(0, outerRounds).map((list) => list.slice(list.length / 2));

  return (
    <div className="scroll-x pb-4">
      <div className="mx-auto flex w-max items-start px-4 py-4">
        {/* Left half: outermost round first, marching towards the centre. */}
        {leftRounds.map((list, r) => (
          <div key={"L" + r} className="flex items-start">
            <RoundColumn
              label={list[0]?.roundName ?? ""}
              matches={list}
              bodyHeight={bodyHeight}
              {...cardProps}
            />
            {r < leftRounds.length - 1 ? (
              <PairConnector side="left" count={leftRounds[r + 1].length} bodyHeight={bodyHeight} />
            ) : (
              <StraightConnector side="left" bodyHeight={bodyHeight} />
            )}
          </div>
        ))}

        {/* Centre: the final, with the third-place play-off beneath it. */}
        <div className="flex flex-col" style={{ width: COLUMN_WIDTH + 20 }}>
          <div
            className="flex items-center justify-center gap-1.5"
            style={{ height: HEADER_HEIGHT }}
          >
            <Trophy className="h-3.5 w-3.5 text-amber-300" aria-hidden />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-200">
              Final
            </span>
          </div>
          <div className="flex flex-col justify-center px-2" style={{ height: bodyHeight }}>
            {finalMatch && <BracketCard match={finalMatch} isFinal {...cardProps} />}
          </div>
          {third && (
            <div className="mt-6 px-2">
              <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                Third place
              </p>
              <BracketCard match={third} {...cardProps} />
            </div>
          )}
        </div>

        {/* Right half: mirrored, outermost round last. */}
        {rightRounds
          .map((list, r) => ({ list, r }))
          .reverse()
          .map(({ list, r }) => (
            <div key={"R" + r} className="flex items-start">
              {r < rightRounds.length - 1 ? (
                <PairConnector
                  side="right"
                  count={rightRounds[r + 1].length}
                  bodyHeight={bodyHeight}
                />
              ) : (
                <StraightConnector side="right" bodyHeight={bodyHeight} />
              )}
              <RoundColumn
                label={list[0]?.roundName ?? ""}
                matches={list}
                bodyHeight={bodyHeight}
                {...cardProps}
              />
            </div>
          ))}
      </div>
    </div>
  );
}

function RoundLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-center text-[11px] font-bold uppercase tracking-[0.2em] text-royal-300/70"
      style={{ height: HEADER_HEIGHT }}
    >
      {children}
    </div>
  );
}

function RoundColumn({
  label,
  matches,
  bodyHeight,
  readOnly,
  onSelect,
}: {
  label: string;
  matches: ResolvedBracketMatch[];
  bodyHeight: number;
  readOnly: boolean;
  onSelect?: (match: ResolvedBracketMatch) => void;
}) {
  return (
    <div className="flex flex-col" style={{ width: COLUMN_WIDTH }}>
      <RoundLabel>{label}</RoundLabel>
      <div className="flex flex-col" style={{ height: bodyHeight }}>
        {matches.map((m) => (
          <div key={m.id} className="flex flex-1 items-center px-2">
            <BracketCard match={m} readOnly={readOnly} onSelect={onSelect} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Joins a pair of ties in one round to the single tie they feed in the next. */
function PairConnector({
  side,
  count,
  bodyHeight,
}: {
  side: "left" | "right";
  count: number;
  bodyHeight: number;
}) {
  const near = side === "left" ? "left-0" : "right-0";
  const mid = side === "left" ? "left-1/2" : "right-1/2";

  return (
    <div className="flex flex-col" style={{ width: CONNECTOR_WIDTH }}>
      <div style={{ height: HEADER_HEIGHT }} />
      <div className="flex flex-col" style={{ height: bodyHeight }} aria-hidden>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="relative flex-1">
            <span className={`absolute ${near} top-1/4 w-1/2 border-t ${LINE}`} />
            <span className={`absolute ${near} top-3/4 w-1/2 border-t ${LINE}`} />
            <span className={`absolute ${mid} top-1/4 h-1/2 border-l ${LINE}`} />
            <span className={`absolute ${mid} top-1/2 w-1/2 border-t ${LINE}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Straight run from a semifinal into the final. */
function StraightConnector({
  side,
  bodyHeight,
}: {
  side: "left" | "right";
  bodyHeight: number;
}) {
  return (
    <div className="flex flex-col" style={{ width: CONNECTOR_WIDTH }}>
      <div style={{ height: HEADER_HEIGHT }} />
      <div className="relative" style={{ height: bodyHeight }} aria-hidden>
        <span
          className={`absolute top-1/2 w-full border-t ${LINE} ${
            side === "left" ? "left-0" : "right-0"
          }`}
        />
      </div>
    </div>
  );
}

function BracketCard({
  match,
  isFinal = false,
  readOnly,
  onSelect,
}: {
  match: ResolvedBracketMatch;
  isFinal?: boolean;
  readOnly: boolean;
  onSelect?: (match: ResolvedBracketMatch) => void;
}) {
  const ready = !!match.playerAId && !!match.playerBId;
  const interactive = !readOnly && ready && !!onSelect;

  const inner = (
    <div
      className={`w-full overflow-hidden rounded-lg bg-white shadow-lg shadow-black/40 ring-1 ring-inset transition-all ${
        isFinal
          ? "ring-amber-300/60 shadow-amber-500/20"
          : match.completed
            ? "ring-royal-400/40"
            : "ring-black/10"
      } ${interactive ? "group-hover:-translate-y-0.5 group-hover:shadow-xl group-hover:ring-royal-400" : ""}`}
    >
      <div
        className={`flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
          isFinal ? "bg-gradient-to-r from-amber-400 to-amber-300 text-navy-900" : "bg-navy-800 text-royal-200"
        }`}
      >
        <span>Match {match.matchNumber}</span>
        <span className={isFinal ? "text-navy-900/70" : "text-white/40"}>
          {match.completed ? "FT" : ready ? "TBP" : "--"}
        </span>
      </div>

      <BracketSide
        name={match.labelA}
        goals={match.completed ? (match.result?.aGoals ?? null) : null}
        isWinner={match.completed && match.winnerId === match.playerAId}
        placeholder={!match.playerAId}
      />
      <div className="h-px bg-slate-200" />
      <BracketSide
        name={match.labelB}
        goals={match.completed ? (match.result?.bGoals ?? null) : null}
        isWinner={match.completed && match.winnerId === match.playerBId}
        placeholder={!match.playerBId}
      />
    </div>
  );

  if (!interactive) return inner;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(match)}
      aria-label={`Enter result for match ${match.matchNumber}: ${match.labelA} versus ${match.labelB}`}
      className="group w-full cursor-pointer text-left"
    >
      {inner}
    </button>
  );
}

function BracketSide({
  name,
  goals,
  isWinner,
  placeholder,
}: {
  name: string;
  goals: number | null;
  isWinner: boolean;
  placeholder: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-2 ${
        isWinner ? "bg-royal-500/10" : ""
      }`}
    >
      <span
        className={`h-4 w-1 shrink-0 rounded-full ${
          isWinner ? "bg-royal-500" : "bg-slate-200"
        }`}
        aria-hidden
      />
      <span
        className={`min-w-0 flex-1 truncate text-[13px] ${
          placeholder
            ? "italic text-slate-400"
            : isWinner
              ? "font-bold text-navy-900"
              : "font-medium text-slate-700"
        }`}
        title={name}
      >
        {name}
      </span>
      <span
        className={`w-6 shrink-0 text-center text-sm font-bold tabular-nums ${
          goals === null ? "text-slate-300" : isWinner ? "text-navy-900" : "text-slate-500"
        }`}
      >
        {goals === null ? "-" : goals}
      </span>
    </div>
  );
}
