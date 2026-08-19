"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag, ListOrdered, Shuffle, Table2, Trophy } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  InfoNote,
  Modal,
  SectionTitle,
} from "@/components/ui";
import { TabBar, type TabKey } from "@/components/LeagueShell";
import { StandingsTable } from "@/components/StandingsTable";
import { GroupMatches, KnockoutMatches } from "@/components/MatchesPanel";
import { BracketView } from "@/components/BracketView";
import { PodiumView } from "@/components/PodiumView";
import { ScoreDialog, type ScoreDialogTarget } from "@/components/ScoreDialog";
import {
  clearGroupResult,
  organizeBracket,
  organizeGroupMatches,
  saveBracketResult,
  saveGroupResult,
  startBracket,
} from "@/lib/db";
import { friendlyFirestoreError } from "@/lib/firebase";
import {
  qualifiedPlayerIds,
  resolveBracket,
  staleResultIds,
} from "@/lib/bracket";
import { isMatchCompleted } from "@/lib/schedule";
import type { LeagueView } from "@/lib/tournament";
import type { BracketDoc, Match, ResolvedBracketMatch } from "@/lib/types";

type Selection =
  | { kind: "group"; match: Match }
  | { kind: "knockout"; match: ResolvedBracketMatch }
  | null;

export function TournamentBoard({
  view,
  readOnly,
}: {
  view: LeagueView;
  readOnly: boolean;
}) {
  const {
    tournament,
    players,
    playersById,
    matches,
    standings,
    bracket,
    bracketMatches,
    groupComplete,
    groupPlayed,
    groupTotal,
    plannedBracketSize,
    finished,
    champion,
  } = view;

  const tabs: TabKey[] = useMemo(() => {
    const list: TabKey[] = tournament.mode === "GROUP" ? ["group", "matches", "bracket"] : ["matches", "bracket"];
    if (finished) list.push("results");
    return list;
  }, [tournament.mode, finished]);

  const bracketLocked = tournament.status !== "KNOCKOUT";
  const [tab, setTab] = useState<TabKey>(() =>
    tournament.mode === "GROUP" ? "group" : "matches",
  );
  const [selection, setSelection] = useState<Selection>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmBracket, setConfirmBracket] = useState(false);
  const [dismissedChampion, setDismissedChampion] = useState<string | null>(null);

  // Keep the tab valid as the tournament moves through its phases.
  useEffect(() => {
    if (!tabs.includes(tab)) {
      setTab(tabs[0]);
      return;
    }
    if (tab === "bracket" && bracketLocked) setTab(tabs[0]);
  }, [tabs, tab, bracketLocked]);

  // Jump to the bracket the moment it opens, and to the results when it ends.
  const bracketOpen = tournament.status === "KNOCKOUT";
  useEffect(() => {
    if (bracketOpen && !finished) setTab("bracket");
  }, [bracketOpen, finished]);
  useEffect(() => {
    if (finished) setTab("results");
  }, [finished]);

  function fail(err: unknown, fallback: string) {
    console.error("[Yassin's League] " + fallback, err);
    setError(friendlyFirestoreError(err, fallback));
  }

  async function run(key: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (err) {
      fail(err, "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  /* ------------------------------------------------------- admin actions */

  const organiseGroup = () =>
    run("organise-group", async () => {
      if (tournament.matchesOrganized || matches.length > 0) {
        setError("Fixtures have already been organised for this league.");
        return;
      }
      await organizeGroupMatches(players);
    });

  const openBracket = () =>
    run("start-bracket", async () => {
      if (!groupComplete) {
        setError("You cannot start the bracket until all group-stage matches are completed.");
        return;
      }
      if (!plannedBracketSize) {
        setError("There are not enough players for a knockout bracket.");
        return;
      }
      await startBracket(qualifiedPlayerIds(standings, plannedBracketSize), plannedBracketSize);
      setConfirmBracket(false);
    });

  const organiseBracket = () =>
    run("organise-bracket", async () => {
      if (bracket) {
        setError("The bracket has already been organised.");
        return;
      }
      const ids =
        tournament.mode === "KNOCKOUT"
          ? players.map((p) => p.id)
          : tournament.qualifiedIds;
      if (ids.length === 0) {
        setError("No qualified players found. Start the bracket first.");
        return;
      }
      await organizeBracket(ids);
    });

  async function saveGroupScore(match: Match, a: number, b: number) {
    await saveGroupResult(match, a, b);
  }

  async function saveKnockoutScore(match: ResolvedBracketMatch, a: number, b: number) {
    if (!bracket || !match.playerAId || !match.playerBId) {
      throw new Error("This tie does not have both players yet.");
    }
    const result = { aId: match.playerAId, bId: match.playerBId, aGoals: a, bGoals: b };

    // Work out which later results the new winner invalidates, and clear them in
    // the same write so the tree can never hold a player who no longer belongs.
    const candidate: BracketDoc = {
      ...bracket,
      matches: {
        ...bracket.matches,
        [match.id]: { ...bracket.matches[match.id], result },
      },
    };
    const stale = staleResultIds(resolveBracket(candidate, playersById));
    await saveBracketResult(match.id, result, stale);
  }

  /* ------------------------------------------------------- score dialog */

  const dialogTarget: ScoreDialogTarget | null = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === "group") {
      const m = selection.match;
      return {
        key: m.id + ":" + m.scoreA + ":" + m.scoreB,
        title: isMatchCompleted(m) ? "Edit result" : "Enter result",
        subtitle: `Match ${m.index} - Matchday ${m.matchday}`,
        nameA: playersById.get(m.playerAId)?.name ?? "Unknown player",
        nameB: playersById.get(m.playerBId)?.name ?? "Unknown player",
        initialA: m.scoreA,
        initialB: m.scoreB,
        allowDraw: true,
        canClear: isMatchCompleted(m),
      };
    }
    const m = selection.match;
    return {
      key: m.id + ":" + (m.result?.aGoals ?? "") + ":" + (m.result?.bGoals ?? ""),
      title: m.completed ? "Edit result" : "Enter result",
      subtitle: `Match ${m.matchNumber} - ${m.roundName}`,
      nameA: m.labelA,
      nameB: m.labelB,
      initialA: m.result?.aGoals ?? null,
      initialB: m.result?.bGoals ?? null,
      allowDraw: false,
      canClear: false,
    };
  }, [selection, playersById]);

  /* -------------------------------------------------------------- render */

  const qualifyingIds = new Set(
    plannedBracketSize && tournament.mode === "GROUP"
      ? standings.slice(0, plannedBracketSize).map((r) => r.playerId)
      : [],
  );

  return (
    <div className="space-y-6">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <StatusStrip
        view={view}
        readOnly={readOnly}
        busy={busy}
        onStartBracket={() => setConfirmBracket(true)}
      />

      <div className="border-b border-white/10">
        <TabBar
          tabs={tabs}
          active={tab}
          onChange={setTab}
          disabledTabs={{ bracket: bracketLocked }}
          disabledHint={
            tournament.mode === "GROUP"
              ? "The bracket opens once the group stage is complete."
              : "The bracket is not open yet."
          }
        />
      </div>

      {tab === "group" && (
        <section className="space-y-4">
          <SectionTitle
            hint={
              groupTotal > 0
                ? `${groupPlayed} of ${groupTotal} fixtures played - the table updates as results are saved.`
                : "The table updates automatically as results are saved."
            }
          >
            Group Stage
          </SectionTitle>
          {plannedBracketSize && players.length > plannedBracketSize && (
            <p className="text-xs text-royal-300/70">
              The highlighted top {plannedBracketSize} qualify for the knockout bracket.
            </p>
          )}
          <StandingsTable
            standings={standings}
            qualifyingCount={tournament.mode === "GROUP" ? plannedBracketSize : null}
            highlightIds={qualifyingIds}
          />
        </section>
      )}

      {tab === "matches" && (
        <section className="space-y-5">
          <SectionTitle
            hint={
              readOnly
                ? "Results appear here as soon as the admin saves them."
                : "Click any match to enter or edit its score."
            }
            action={
              !readOnly && tournament.mode === "GROUP" && !tournament.matchesOrganized ? (
                <Button
                  size="lg"
                  onClick={organiseGroup}
                  loading={busy === "organise-group"}
                  disabled={!!busy}
                >
                  <Shuffle className="h-4 w-4" aria-hidden />
                  ORGANIZE MATCHES
                </Button>
              ) : undefined
            }
          >
            Matches
          </SectionTitle>

          {tournament.mode === "GROUP" ? (
            <>
              <GroupMatches
                matches={matches}
                playersById={playersById}
                readOnly={readOnly}
                onSelect={(match) => setSelection({ kind: "group", match })}
              />
              {bracketMatches.length > 0 && (
                <div className="space-y-4 border-t border-white/10 pt-6">
                  <h2 className="title-display text-lg text-white">Knockout ties</h2>
                  <KnockoutMatches
                    matches={bracketMatches}
                    readOnly={readOnly}
                    onSelect={(match) => setSelection({ kind: "knockout", match })}
                  />
                </div>
              )}
            </>
          ) : (
            <KnockoutMatches
              matches={bracketMatches}
              readOnly={readOnly}
              onSelect={(match) => setSelection({ kind: "knockout", match })}
            />
          )}
        </section>
      )}

      {tab === "bracket" && (
        <section className="space-y-5">
          <SectionTitle
            hint={
              bracket
                ? "Winners advance automatically as results are saved."
                : "Draw the knockout rounds to begin."
            }
            action={
              !readOnly && !bracket ? (
                <Button
                  size="lg"
                  onClick={organiseBracket}
                  loading={busy === "organise-bracket"}
                  disabled={!!busy}
                >
                  <Shuffle className="h-4 w-4" aria-hidden />
                  ORGANIZE MATCHES
                </Button>
              ) : undefined
            }
          >
            Knockout Bracket
          </SectionTitle>

          {bracket ? (
            <Card className="p-2 sm:p-4">
              <BracketView
                matches={bracketMatches}
                size={bracket.size}
                readOnly={readOnly}
                onSelect={(match) => setSelection({ kind: "knockout", match })}
              />
            </Card>
          ) : (
            <QualifiedPreview view={view} readOnly={readOnly} />
          )}
        </section>
      )}

      {tab === "results" && <PodiumView view={view} />}

      <ScoreDialog
        target={dialogTarget}
        onClose={() => setSelection(null)}
        onSave={async (a, b) => {
          if (!selection) return;
          if (selection.kind === "group") await saveGroupScore(selection.match, a, b);
          else await saveKnockoutScore(selection.match, a, b);
        }}
        onClear={
          selection?.kind === "group" && isMatchCompleted(selection.match)
            ? async () => {
                await clearGroupResult(selection.match);
              }
            : undefined
        }
      />

      <Modal
        open={confirmBracket}
        onClose={() => setConfirmBracket(false)}
        title="Start the knockout bracket?"
      >
        <div className="space-y-4 text-sm text-royal-200/85">
          <p>
            The group stage is complete. The top{" "}
            <strong className="text-white">{plannedBracketSize}</strong> players in the
            table will go through to a {plannedBracketSize}-player knockout bracket.
          </p>
          <ol className="space-y-1 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            {standings.slice(0, plannedBracketSize ?? 0).map((row) => (
              <li key={row.playerId} className="flex justify-between gap-3">
                <span className="truncate text-white">
                  {row.position}. {row.playerName}
                </span>
                <span className="shrink-0 tabular-nums text-white/50">{row.points} pts</span>
              </li>
            ))}
          </ol>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmBracket(false)}>
              Cancel
            </Button>
            <Button onClick={openBracket} loading={busy === "start-bracket"}>
              START BRACKET
            </Button>
          </div>
        </div>
      </Modal>

      {champion && finished && dismissedChampion !== champion.playerId && (
        <ChampionModal
          name={champion.playerName}
          onClose={() => setDismissedChampion(champion.playerId)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ sub-views */

function StatusStrip({
  view,
  readOnly,
  busy,
  onStartBracket,
}: {
  view: LeagueView;
  readOnly: boolean;
  busy: string | null;
  onStartBracket: () => void;
}) {
  const { status, groupPlayed, groupTotal, plannedBracketSize, tournament, players } = view;

  if (status === "READY_FOR_BRACKET") {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-4 border-royal-400/30 bg-royal-500/10 p-4">
        <div className="flex items-center gap-3">
          <Flag className="h-5 w-5 text-royal-300" aria-hidden />
          <div>
            <p className="font-semibold text-white">Group stage complete</p>
            <p className="text-sm text-royal-200/80">
              All {groupTotal} fixtures are played. The top {plannedBracketSize} qualify.
            </p>
          </div>
        </div>
        {!readOnly && (
          <Button size="lg" onClick={onStartBracket} disabled={!!busy}>
            <Trophy className="h-4 w-4" aria-hidden />
            START BRACKET
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
      <Badge tone="muted">
        {players.length} {players.length === 1 ? "player" : "players"}
      </Badge>
      {tournament.mode === "GROUP" && groupTotal > 0 && (
        <Badge tone="muted">
          {groupPlayed}/{groupTotal} fixtures played
        </Badge>
      )}
      {tournament.mode === "KNOCKOUT" && (
        <Badge tone="muted">Direct knockout - no group stage</Badge>
      )}
      {status === "THIRD_PLACE" && (
        <Badge tone="default">Third-place play-off still to be played</Badge>
      )}
    </div>
  );
}

function QualifiedPreview({ view, readOnly }: { view: LeagueView; readOnly: boolean }) {
  const { tournament, players, playersById, standings } = view;
  const ids =
    tournament.mode === "KNOCKOUT" ? players.map((p) => p.id) : tournament.qualifiedIds;

  if (ids.length === 0) {
    return (
      <EmptyState icon={<Trophy className="h-7 w-7" />} title="The bracket is not drawn yet">
        {readOnly
          ? "It will appear here as soon as the admin organises the knockout rounds."
          : 'Use "Organize matches" above to draw the knockout rounds.'}
      </EmptyState>
    );
  }

  // In direct-knockout mode there is no table, so number the entrants instead
  // of showing a league position that would mean nothing.
  const rank =
    tournament.mode === "KNOCKOUT"
      ? new Map(ids.map((id, i) => [id, i + 1]))
      : new Map(standings.map((r) => [r.playerId, r.position]));

  return (
    <div className="space-y-4">
      <InfoNote>
        {ids.length} players are in the draw. The pairings are randomised when you
        organise the matches, so the table order does not decide who meets whom.
      </InfoNote>
      <Card className="p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-royal-300/80">
          <Table2 className="h-4 w-4" aria-hidden />
          {tournament.mode === "KNOCKOUT" ? "Players in the draw" : "Qualified players"}
        </h3>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ids.map((id, i) => (
            <li
              key={id}
              className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-sm"
            >
              <span className="w-5 shrink-0 text-xs tabular-nums text-white/35">
                {rank.get(id) ?? i + 1}
              </span>
              <span className="truncate text-white">
                {playersById.get(id)?.name ?? "Unknown"}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function ChampionModal({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Tournament complete">
      <div className="space-y-5 text-center">
        <div className="text-5xl" aria-hidden>
          🏆
        </div>
        <p className="title-display text-2xl leading-tight text-white">
          {name.toUpperCase()} WON
          <span className="block bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent">
            YASSIN&rsquo;S LEAGUE!
          </span>
        </p>
        <p className="text-sm text-royal-200/70">
          The full podium and final table are on the Results tab.
        </p>
        <Button variant="gold" onClick={onClose} className="w-full">
          Close
        </Button>
      </div>
    </Modal>
  );
}

/** Small shared empty state used by both roles when nothing has started. */
export function NotStartedYet({ readOnly }: { readOnly: boolean }) {
  return (
    <EmptyState icon={<ListOrdered className="h-7 w-7" />} title="No league is running yet">
      {readOnly
        ? "Once the admin adds players and starts the league, everything will appear here automatically."
        : "Add players on the setup screen to start a new league."}
    </EmptyState>
  );
}
