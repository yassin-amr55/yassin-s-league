/**
 * Core domain types for Yassin's League.
 *
 * Design rule: only *facts* are stored (players, fixtures, entered scores).
 * Everything derived (standings, bracket participants, champion, tournament
 * status) is recomputed from those facts, so an edited result can never leave
 * stale numbers behind.
 */

/** How the tournament is being played. */
export type TournamentMode =
  /** Round-robin group stage first, then a knockout bracket. */
  | "GROUP"
  /** Player count is an exact power of two -> straight to the bracket. */
  | "KNOCKOUT";

/** Persisted lifecycle state (see `deriveStatus` for the display state). */
export type TournamentStatus =
  | "SETUP"
  | "GROUP_STAGE"
  | "KNOCKOUT";

/** Lifecycle state shown in the UI - includes states derived from results. */
export type DerivedStatus =
  | "SETUP"
  | "GROUP_STAGE"
  | "READY_FOR_BRACKET"
  | "KNOCKOUT"
  | "THIRD_PLACE"
  | "FINISHED";

export interface Player {
  id: string;
  name: string;
  /** Stable creation order, used only as a last-resort tiebreak / display order. */
  order: number;
}

/** A single round-robin fixture. Lives inside a matchday document. */
export interface Match {
  id: string;
  /** 1-based global match number across the whole schedule. */
  index: number;
  /** 1-based matchday (round) number. */
  matchday: number;
  playerAId: string;
  playerBId: string;
  scoreA: number | null;
  scoreB: number | null;
}

/** Firestore document holding every fixture of one matchday. */
export interface MatchdayDoc {
  matchday: number;
  matches: Record<string, Match>;
}

/** A result as entered by the admin, with a snapshot of who played it. */
export interface BracketResult {
  aId: string;
  bId: string;
  aGoals: number;
  bGoals: number;
}

/**
 * A knockout fixture. Participants for rounds > 0 are *never* stored - they are
 * derived from the results of the feeding matches, so the tree can never hold a
 * player who did not actually win their way there.
 */
export interface BracketMatch {
  id: string;
  /** 0-based: round 0 is the first round played. */
  round: number;
  /** Position of the match inside its round, 0-based. */
  slot: number;
  /** Only set for round 0 - the drawn participants. */
  seedAId?: string | null;
  seedBId?: string | null;
  /** The third-place play-off sits outside the main tree. */
  isThirdPlace?: boolean;
  result: BracketResult | null;
}

export interface BracketDoc {
  size: number;
  /** Player ids that qualified, in draw order. */
  participants: string[];
  matches: Record<string, BracketMatch>;
  createdAt?: number;
}

/** A bracket match with participants and labels resolved from results. */
export interface ResolvedBracketMatch extends BracketMatch {
  playerAId: string | null;
  playerBId: string | null;
  /** Human label used when a participant is not decided yet. */
  labelA: string;
  labelB: string;
  winnerId: string | null;
  loserId: string | null;
  completed: boolean;
  roundName: string;
  /** 1-based match number for display. */
  matchNumber: number;
  /** True when the stored result no longer matches the current participants. */
  stale: boolean;
}

export interface Tournament {
  status: TournamentStatus;
  mode: TournamentMode;
  /** Names typed on the setup screen before the league starts. */
  draftPlayers: string[];
  playerCount: number;
  /** True once the round-robin fixtures have been generated. */
  matchesOrganized: boolean;
  /** True once the knockout tree has been generated. */
  bracketOrganized: boolean;
  bracketSize: number | null;
  /** Player ids that qualified for the knockout stage (set on START BRACKET). */
  qualifiedIds: string[];
  createdAt: number | null;
  updatedAt: number | null;
}

export interface StandingRow {
  position: number;
  playerId: string;
  playerName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface PodiumEntry {
  place: 1 | 2 | 3;
  playerId: string;
  playerName: string;
}
