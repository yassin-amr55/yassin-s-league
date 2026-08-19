import type { Match, Player } from "./types";
import { createId, shuffle } from "./ids";

const BYE = "__BYE__";

/**
 * Builds a complete single round-robin schedule using the circle method.
 *
 * Guarantees:
 *  - every pair of players meets exactly once  -> n * (n - 1) / 2 fixtures
 *  - no player appears twice inside one matchday
 *  - the draw is randomised, so two leagues with the same names differ
 *
 * With an odd number of players a virtual bye is added; the bye's pairing in
 * each round is simply dropped, which is what makes one player rest per round.
 */
export function generateRoundRobin(players: readonly Player[]): Match[] {
  if (players.length < 2) return [];

  const ids: string[] = shuffle(players.map((p) => p.id));
  if (ids.length % 2 === 1) ids.push(BYE);

  const size = ids.length;
  const rounds = size - 1;
  const half = size / 2;

  let wheel = [...ids];
  const matches: Match[] = [];
  let index = 0;
  let matchday = 0;

  for (let r = 0; r < rounds; r++) {
    const dayPairs: Array<[string, string]> = [];
    for (let i = 0; i < half; i++) {
      const a = wheel[i];
      const b = wheel[size - 1 - i];
      if (a === BYE || b === BYE) continue;
      // Alternate the "home" side each round so one player is not always first.
      dayPairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }

    if (dayPairs.length > 0) {
      matchday += 1;
      for (const [playerAId, playerBId] of shuffle(dayPairs)) {
        index += 1;
        matches.push({
          id: createId("m"),
          index,
          matchday,
          playerAId,
          playerBId,
          scoreA: null,
          scoreB: null,
        });
      }
    }

    // Rotate everything except the first entry.
    wheel = [wheel[0], wheel[size - 1], ...wheel.slice(1, size - 1)];
  }

  return matches;
}

/** Groups a flat fixture list into ordered matchdays. */
export function groupByMatchday(matches: readonly Match[]): Array<{ matchday: number; matches: Match[] }> {
  const byDay = new Map<number, Match[]>();
  for (const m of matches) {
    const bucket = byDay.get(m.matchday);
    if (bucket) bucket.push(m);
    else byDay.set(m.matchday, [m]);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([matchday, list]) => ({
      matchday,
      matches: list.sort((a, b) => a.index - b.index),
    }));
}

export function isMatchCompleted(match: Match): boolean {
  return match.scoreA !== null && match.scoreB !== null;
}

export function expectedFixtureCount(playerCount: number): number {
  return playerCount < 2 ? 0 : (playerCount * (playerCount - 1)) / 2;
}
