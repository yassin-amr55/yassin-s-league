import type { Match, Player, StandingRow } from "./types";
import { isMatchCompleted } from "./schedule";

const WIN_POINTS = 3;
const DRAW_POINTS = 1;

/**
 * Recomputes the whole table from the stored results.
 *
 * Nothing is accumulated on top of a previous table, so editing a result simply
 * produces a different table rather than double-counting the old one.
 */
export function computeStandings(
  players: readonly Player[],
  matches: readonly Match[],
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const p of players) {
    rows.set(p.id, {
      position: 0,
      playerId: p.id,
      playerName: p.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    });
  }

  for (const match of matches) {
    if (!isMatchCompleted(match)) continue;
    const a = rows.get(match.playerAId);
    const b = rows.get(match.playerBId);
    // A fixture that references a removed player is ignored rather than trusted.
    if (!a || !b) continue;

    const ga = match.scoreA as number;
    const gb = match.scoreB as number;

    a.played += 1;
    b.played += 1;
    a.goalsFor += ga;
    a.goalsAgainst += gb;
    b.goalsFor += gb;
    b.goalsAgainst += ga;

    if (ga > gb) {
      a.wins += 1;
      b.losses += 1;
      a.points += WIN_POINTS;
    } else if (gb > ga) {
      b.wins += 1;
      a.losses += 1;
      b.points += WIN_POINTS;
    } else {
      a.draws += 1;
      b.draws += 1;
      a.points += DRAW_POINTS;
      b.points += DRAW_POINTS;
    }
  }

  const table = [...rows.values()];
  for (const row of table) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
  }

  table.sort(compareStandingRows);
  table.forEach((row, i) => {
    row.position = i + 1;
  });
  return table;
}

/** Points -> goal difference -> goals for -> name (deterministic fallback). */
export function compareStandingRows(a: StandingRow, b: StandingRow): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  const byName = a.playerName.localeCompare(b.playerName, "en", { sensitivity: "base" });
  if (byName !== 0) return byName;
  return a.playerId.localeCompare(b.playerId);
}
