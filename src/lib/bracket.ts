import type {
  BracketDoc,
  BracketMatch,
  Player,
  PodiumEntry,
  ResolvedBracketMatch,
  StandingRow,
} from "./types";
import { shuffle } from "./ids";

export const BRACKET_SIZES = [2, 4, 8, 16, 32] as const;
export type BracketSize = (typeof BRACKET_SIZES)[number];

export const MAX_PLAYERS = 100;
export const MIN_PLAYERS = 2;

/** True for 2, 4, 8, 16, 32 - the counts that skip the group stage entirely. */
export function isDirectKnockoutCount(playerCount: number): boolean {
  return (BRACKET_SIZES as readonly number[]).includes(playerCount);
}

/** Largest allowed bracket size that is <= the number of players. */
export function bracketSizeFor(playerCount: number): BracketSize | null {
  let best: BracketSize | null = null;
  for (const size of BRACKET_SIZES) {
    if (size <= playerCount) best = size;
  }
  return best;
}

export function roundsFor(size: number): number {
  return Math.log2(size);
}

/** "Round of 16", "Quarterfinals", ... based on how many players are left. */
export function roundNameFor(size: number, round: number): string {
  const playersLeft = size / 2 ** round;
  switch (playersLeft) {
    case 2:
      return "Final";
    case 4:
      return "Semifinals";
    case 8:
      return "Quarterfinals";
    default:
      return "Round of " + playersLeft;
  }
}

export function hasThirdPlaceMatch(size: number): boolean {
  return size >= 4;
}

export const THIRD_PLACE_ID = "third-place";

/**
 * Creates the full knockout tree up front.
 *
 * Only the first round stores participants (the random draw). Later rounds are
 * intentionally empty - they are filled in by resolveBracket from the results of
 * the matches that feed them, so a player can never appear in a round they did
 * not actually reach.
 */
export function generateBracket(qualifiedPlayerIds: readonly string[]): BracketDoc {
  const size = qualifiedPlayerIds.length;
  if (!(BRACKET_SIZES as readonly number[]).includes(size)) {
    throw new Error("Unsupported bracket size: " + size);
  }

  const draw = shuffle(qualifiedPlayerIds);
  const matches: Record<string, BracketMatch> = {};
  const rounds = roundsFor(size);

  for (let round = 0; round < rounds; round++) {
    const count = size / 2 ** (round + 1);
    for (let slot = 0; slot < count; slot++) {
      const id = "r" + round + "s" + slot;
      matches[id] = {
        id,
        round,
        slot,
        seedAId: round === 0 ? draw[slot * 2] : null,
        seedBId: round === 0 ? draw[slot * 2 + 1] : null,
        result: null,
      };
    }
  }

  if (hasThirdPlaceMatch(size)) {
    matches[THIRD_PLACE_ID] = {
      id: THIRD_PLACE_ID,
      round: rounds - 1,
      slot: 0,
      isThirdPlace: true,
      result: null,
    };
  }

  return { size, participants: draw, matches, createdAt: Date.now() };
}

/** Display order: earlier rounds first, third-place play-off just before the final. */
export function orderedBracketMatches(bracket: BracketDoc): BracketMatch[] {
  const rounds = roundsFor(bracket.size);
  const list: BracketMatch[] = [];
  for (let round = 0; round < rounds; round++) {
    const inRound = Object.values(bracket.matches)
      .filter((m) => m.round === round && !m.isThirdPlace)
      .sort((a, b) => a.slot - b.slot);
    if (round === rounds - 1) {
      const third = bracket.matches[THIRD_PLACE_ID];
      if (third) list.push(third);
    }
    list.push(...inRound);
  }
  return list;
}

function winnerOf(result: BracketMatch["result"]): string | null {
  if (!result) return null;
  if (result.aGoals === result.bGoals) return null; // draws never advance anyone
  return result.aGoals > result.bGoals ? result.aId : result.bId;
}

function loserOf(result: BracketMatch["result"]): string | null {
  if (!result) return null;
  if (result.aGoals === result.bGoals) return null;
  return result.aGoals > result.bGoals ? result.bId : result.aId;
}

/**
 * Fills in every participant from the stored results.
 *
 * A result is only honoured when the two players it records still match the
 * players the tree currently sends into that match. If an earlier score is
 * edited so somebody else advances, the downstream result is reported as stale
 * instead of silently standing.
 */
export function resolveBracket(
  bracket: BracketDoc,
  playersById: ReadonlyMap<string, Player>,
): ResolvedBracketMatch[] {
  const ordered = orderedBracketMatches(bracket);
  const numberById = new Map<string, number>();
  ordered.forEach((m, i) => numberById.set(m.id, i + 1));

  const rounds = roundsFor(bracket.size);
  const resolved = new Map<string, ResolvedBracketMatch>();

  const nameOf = (id: string | null): string | null =>
    id ? (playersById.get(id)?.name ?? null) : null;

  const build = (match: BracketMatch): ResolvedBracketMatch => {
    let playerAId: string | null = null;
    let playerBId: string | null = null;
    let labelA = "TBD";
    let labelB = "TBD";

    if (match.isThirdPlace) {
      const semiRound = rounds - 2;
      const semiAId = "r" + semiRound + "s0";
      const semiBId = "r" + semiRound + "s1";
      playerAId = resolved.get(semiAId)?.loserId ?? null;
      playerBId = resolved.get(semiBId)?.loserId ?? null;
      labelA = nameOf(playerAId) ?? "Loser of Match " + numberById.get(semiAId);
      labelB = nameOf(playerBId) ?? "Loser of Match " + numberById.get(semiBId);
    } else if (match.round === 0) {
      playerAId = match.seedAId ?? null;
      playerBId = match.seedBId ?? null;
      labelA = nameOf(playerAId) ?? "TBD";
      labelB = nameOf(playerBId) ?? "TBD";
    } else {
      const feedAId = "r" + (match.round - 1) + "s" + match.slot * 2;
      const feedBId = "r" + (match.round - 1) + "s" + (match.slot * 2 + 1);
      playerAId = resolved.get(feedAId)?.winnerId ?? null;
      playerBId = resolved.get(feedBId)?.winnerId ?? null;
      labelA = nameOf(playerAId) ?? "Winner of Match " + numberById.get(feedAId);
      labelB = nameOf(playerBId) ?? "Winner of Match " + numberById.get(feedBId);
    }

    const result = match.result;
    const stale =
      !!result &&
      (playerAId === null ||
        playerBId === null ||
        result.aId !== playerAId ||
        result.bId !== playerBId);

    const liveResult = stale ? null : result;

    return {
      ...match,
      playerAId,
      playerBId,
      labelA,
      labelB,
      winnerId: winnerOf(liveResult),
      loserId: loserOf(liveResult),
      completed: !!liveResult && liveResult.aGoals !== liveResult.bGoals,
      roundName: match.isThirdPlace ? "Third place" : roundNameFor(bracket.size, match.round),
      matchNumber: numberById.get(match.id) ?? 0,
      stale,
    };
  };

  // Rounds are resolved in order so each one can read the round that feeds it.
  for (let round = 0; round < rounds; round++) {
    const inRound = Object.values(bracket.matches)
      .filter((m) => m.round === round && !m.isThirdPlace)
      .sort((a, b) => a.slot - b.slot);
    for (const m of inRound) resolved.set(m.id, build(m));
  }
  const third = bracket.matches[THIRD_PLACE_ID];
  if (third) resolved.set(third.id, build(third));

  return ordered.map((m) => resolved.get(m.id)!);
}

/** Ids of results that no longer belong to their match and must be cleared. */
export function staleResultIds(resolved: readonly ResolvedBracketMatch[]): string[] {
  return resolved.filter((m) => m.stale).map((m) => m.id);
}

export function finalMatchOf(
  resolved: readonly ResolvedBracketMatch[],
  size: number,
): ResolvedBracketMatch | undefined {
  const finalRound = roundsFor(size) - 1;
  return resolved.find((m) => m.round === finalRound && !m.isThirdPlace);
}

export function thirdPlaceMatchOf(
  resolved: readonly ResolvedBracketMatch[],
): ResolvedBracketMatch | undefined {
  return resolved.find((m) => m.isThirdPlace);
}

export function isBracketComplete(resolved: readonly ResolvedBracketMatch[]): boolean {
  return resolved.length > 0 && resolved.every((m) => m.completed);
}

/** Champion / runner-up / third place, once the relevant matches are played. */
export function computePodium(
  resolved: readonly ResolvedBracketMatch[],
  size: number,
  playersById: ReadonlyMap<string, Player>,
): PodiumEntry[] {
  const podium: PodiumEntry[] = [];
  const nameOf = (id: string) => playersById.get(id)?.name ?? "Unknown";
  const final = finalMatchOf(resolved, size);

  if (final?.completed && final.winnerId && final.loserId) {
    podium.push({ place: 1, playerId: final.winnerId, playerName: nameOf(final.winnerId) });
    podium.push({ place: 2, playerId: final.loserId, playerName: nameOf(final.loserId) });
  }

  const third = thirdPlaceMatchOf(resolved);
  if (third?.completed && third.winnerId) {
    podium.push({ place: 3, playerId: third.winnerId, playerName: nameOf(third.winnerId) });
  }
  return podium;
}

/** Top `size` players of the final table qualify for the knockout stage. */
export function qualifiedPlayerIds(standings: readonly StandingRow[], size: number): string[] {
  return standings.slice(0, size).map((r) => r.playerId);
}

export interface KnockoutPlacement {
  playerId: string;
  playerName: string;
  /** "1st", "2nd", "3rd", "4th" or the round the player went out in. */
  label: string;
  /** Sort key: lower is better. */
  rank: number;
  roundReached: number;
}

/**
 * Final placement for a knockout-only tournament, where there is no league
 * table to fall back on. The top four come from the final and the third-place
 * play-off; everybody else is grouped by the round they went out in.
 */
export function computeKnockoutPlacements(
  resolved: readonly ResolvedBracketMatch[],
  size: number,
  playersById: ReadonlyMap<string, Player>,
  participants: readonly string[],
): KnockoutPlacement[] {
  const rounds = roundsFor(size);
  const final = finalMatchOf(resolved, size);
  const third = thirdPlaceMatchOf(resolved);

  const nameOf = (id: string) => playersById.get(id)?.name ?? "Unknown";

  const rows: KnockoutPlacement[] = participants.map((id) => {
    let roundReached = 0;
    let eliminatedRound: number | null = null;

    for (const match of resolved) {
      if (match.isThirdPlace) continue;
      if (match.playerAId !== id && match.playerBId !== id) continue;
      roundReached = Math.max(roundReached, match.round);
      if (match.completed && match.winnerId !== id) {
        eliminatedRound = eliminatedRound === null ? match.round : Math.max(eliminatedRound, match.round);
      }
    }

    let label: string;
    let rank: number;

    if (final?.completed && final.winnerId === id) {
      label = "1st";
      rank = 1;
    } else if (final?.completed && final.loserId === id) {
      label = "2nd";
      rank = 2;
    } else if (third?.completed && third.winnerId === id) {
      label = "3rd";
      rank = 3;
    } else if (third?.completed && third.loserId === id) {
      label = "4th";
      rank = 4;
    } else if (eliminatedRound !== null) {
      label = "Out in " + roundNameFor(size, eliminatedRound);
      // Later eliminations rank better; offset keeps them below the top four.
      rank = 100 + (rounds - eliminatedRound);
    } else {
      label = "Still in";
      rank = 5;
    }

    return { playerId: id, playerName: nameOf(id), label, rank, roundReached };
  });

  rows.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (b.roundReached !== a.roundReached) return b.roundReached - a.roundReached;
    return a.playerName.localeCompare(b.playerName, "en", { sensitivity: "base" });
  });

  return rows;
}
