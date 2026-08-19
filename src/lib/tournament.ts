import type {
  BracketDoc,
  DerivedStatus,
  Match,
  PodiumEntry,
  Player,
  ResolvedBracketMatch,
  StandingRow,
  Tournament,
} from "./types";
import {
  bracketSizeFor,
  computePodium,
  finalMatchOf,
  hasThirdPlaceMatch,
  isBracketComplete,
  resolveBracket,
  thirdPlaceMatchOf,
} from "./bracket";
import { computeStandings } from "./standings";
import { expectedFixtureCount, isMatchCompleted } from "./schedule";

export const EMPTY_TOURNAMENT: Tournament = {
  status: "SETUP",
  mode: "GROUP",
  draftPlayers: [],
  playerCount: 0,
  matchesOrganized: false,
  bracketOrganized: false,
  bracketSize: null,
  qualifiedIds: [],
  createdAt: null,
  updatedAt: null,
};

/**
 * Single read-model for both the admin and the player view.
 *
 * Everything here is derived from the stored facts on every render, which is
 * what keeps the two views in agreement and keeps edits honest.
 */
export interface LeagueView {
  tournament: Tournament;
  players: Player[];
  playersById: Map<string, Player>;
  matches: Match[];
  standings: StandingRow[];
  bracket: BracketDoc | null;
  bracketMatches: ResolvedBracketMatch[];
  status: DerivedStatus;
  /** Group-stage progress. */
  groupPlayed: number;
  groupTotal: number;
  groupComplete: boolean;
  /** Bracket size that will be used once the group stage ends. */
  plannedBracketSize: number | null;
  podium: PodiumEntry[];
  finished: boolean;
  champion: PodiumEntry | null;
  /** True in group mode once the bracket has been started. */
  showsGroupTab: boolean;
  bracketTabEnabled: boolean;
}

export function buildLeagueView(
  tournament: Tournament,
  players: Player[],
  matches: Match[],
  bracket: BracketDoc | null,
): LeagueView {
  const playersById = new Map(players.map((p) => [p.id, p]));
  const standings = computeStandings(players, matches);

  const groupTotal = tournament.mode === "GROUP" ? expectedFixtureCount(players.length) : 0;
  const groupPlayed = matches.filter(isMatchCompleted).length;
  const groupComplete =
    tournament.mode === "GROUP" &&
    tournament.matchesOrganized &&
    matches.length === groupTotal &&
    groupTotal > 0 &&
    groupPlayed === groupTotal;

  const bracketMatches =
    bracket && bracket.size > 0 ? resolveBracket(bracket, playersById) : [];

  const plannedBracketSize =
    tournament.mode === "KNOCKOUT" ? players.length : bracketSizeFor(players.length);

  const final = bracket ? finalMatchOf(bracketMatches, bracket.size) : undefined;
  const third = thirdPlaceMatchOf(bracketMatches);
  const podium = bracket ? computePodium(bracketMatches, bracket.size, playersById) : [];
  const finished = !!bracket && bracketMatches.length > 0 && isBracketComplete(bracketMatches);

  let status: DerivedStatus;
  if (tournament.status === "SETUP") {
    status = "SETUP";
  } else if (tournament.status === "GROUP_STAGE") {
    status = groupComplete ? "READY_FOR_BRACKET" : "GROUP_STAGE";
  } else if (finished) {
    status = "FINISHED";
  } else if (
    final?.completed &&
    bracket &&
    hasThirdPlaceMatch(bracket.size) &&
    third &&
    !third.completed
  ) {
    status = "THIRD_PLACE";
  } else {
    status = "KNOCKOUT";
  }

  return {
    tournament,
    players,
    playersById,
    matches,
    standings,
    bracket,
    bracketMatches,
    status,
    groupPlayed,
    groupTotal,
    groupComplete,
    plannedBracketSize,
    podium,
    finished,
    champion: podium.find((p) => p.place === 1) ?? null,
    showsGroupTab: tournament.mode === "GROUP",
    bracketTabEnabled: tournament.status === "KNOCKOUT",
  };
}

export function statusLabel(status: DerivedStatus): string {
  switch (status) {
    case "SETUP":
      return "Setup";
    case "GROUP_STAGE":
      return "Group stage";
    case "READY_FOR_BRACKET":
      return "Group stage complete";
    case "KNOCKOUT":
      return "Knockout stage";
    case "THIRD_PLACE":
      return "Third-place play-off";
    case "FINISHED":
      return "Finished";
  }
}
