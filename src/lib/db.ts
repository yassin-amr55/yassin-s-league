import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./firebase";
import { createId } from "./ids";
import { generateRoundRobin, groupByMatchday } from "./schedule";
import { generateBracket } from "./bracket";
import { EMPTY_TOURNAMENT } from "./tournament";
import type { BracketDoc, Match, MatchdayDoc, Player, Tournament } from "./types";

/**
 * Firestore layout (one active league at a time):
 *
 *   leagues/current                     tournament state + setup draft
 *   leagues/current/players/{playerId}  one doc per player (max 100)
 *   leagues/current/matchdays/{dayId}   one doc per matchday, holding that
 *                                       day's fixtures as a map keyed by id
 *   leagues/current/knockout/bracket    the whole knockout tree (max 32 ties)
 *
 * Fixtures are grouped by matchday rather than stored one-per-document: a
 * 100-player league has 4,950 fixtures, which would be 4,950 documents to read
 * on every page load. Grouped, it is 99 documents of roughly 13 KB - far below
 * the 1 MB document limit, and a single fixture can still be updated on its own
 * through a nested field path.
 */
export const LEAGUE_ID = "current";

const leagueDoc = (db: Firestore) => doc(db, "leagues", LEAGUE_ID);
const playersCol = (db: Firestore) => collection(db, "leagues", LEAGUE_ID, "players");
const matchdaysCol = (db: Firestore) => collection(db, "leagues", LEAGUE_ID, "matchdays");
const bracketDoc = (db: Firestore) => doc(db, "leagues", LEAGUE_ID, "knockout", "bracket");

const matchdayId = (matchday: number) => "md" + String(matchday).padStart(4, "0");

/* ------------------------------------------------------------------ reads */

export function subscribeTournament(
  onData: (tournament: Tournament) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    leagueDoc(getDb()),
    (snap) => {
      if (!snap.exists()) {
        onData({ ...EMPTY_TOURNAMENT });
        return;
      }
      onData(normalizeTournament(snap.data()));
    },
    onError,
  );
}

function normalizeTournament(data: DocumentData): Tournament {
  return {
    status: data.status ?? "SETUP",
    mode: data.mode ?? "GROUP",
    draftPlayers: Array.isArray(data.draftPlayers) ? data.draftPlayers : [],
    playerCount: typeof data.playerCount === "number" ? data.playerCount : 0,
    matchesOrganized: !!data.matchesOrganized,
    bracketOrganized: !!data.bracketOrganized,
    bracketSize: typeof data.bracketSize === "number" ? data.bracketSize : null,
    qualifiedIds: Array.isArray(data.qualifiedIds) ? data.qualifiedIds : [],
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

export function subscribePlayers(
  onData: (players: Player[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    playersCol(getDb()),
    (snap) => {
      const players = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: String(data.name ?? ""),
          order: typeof data.order === "number" ? data.order : 0,
        } satisfies Player;
      });
      players.sort((a, b) => a.order - b.order);
      onData(players);
    },
    onError,
  );
}

export function subscribeMatches(
  onData: (matches: Match[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    matchdaysCol(getDb()),
    (snap) => {
      const matches: Match[] = [];
      for (const d of snap.docs) {
        const data = d.data() as MatchdayDoc;
        for (const match of Object.values(data.matches ?? {})) {
          matches.push({
            id: match.id,
            index: match.index,
            matchday: match.matchday,
            playerAId: match.playerAId,
            playerBId: match.playerBId,
            scoreA: match.scoreA ?? null,
            scoreB: match.scoreB ?? null,
          });
        }
      }
      matches.sort((a, b) => a.index - b.index);
      onData(matches);
    },
    onError,
  );
}

export function subscribeBracket(
  onData: (bracket: BracketDoc | null) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    bracketDoc(getDb()),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data() as BracketDoc;
      onData({
        size: data.size,
        participants: data.participants ?? [],
        matches: data.matches ?? {},
        createdAt: data.createdAt,
      });
    },
    onError,
  );
}

/* ----------------------------------------------------------------- writes */

/** Keeps the setup screen alive across a refresh. Debounced by the caller. */
export async function saveDraftPlayers(names: string[]): Promise<void> {
  const db = getDb();
  await setDoc(
    leagueDoc(db),
    { draftPlayers: names, status: "SETUP", updatedAt: Date.now() },
    { merge: true },
  );
}

/**
 * Turns the setup roster into real player documents and opens the tournament in
 * the right mode. Player ids are generated here and used everywhere afterwards,
 * so renaming or repeating a name can never merge two competitors.
 */
export async function startLeague(
  names: string[],
  mode: "GROUP" | "KNOCKOUT",
): Promise<void> {
  const db = getDb();
  const batch = writeBatch(db);

  // Remove any leftovers from a previous league before writing the new roster.
  const existingPlayers = await getDocs(playersCol(db));
  existingPlayers.forEach((d) => batch.delete(d.ref));

  names.forEach((name, index) => {
    const id = createId("p");
    batch.set(doc(playersCol(db), id), { name, order: index, createdAt: Date.now() });
  });

  batch.set(
    leagueDoc(db),
    {
      status: mode === "KNOCKOUT" ? "KNOCKOUT" : "GROUP_STAGE",
      mode,
      draftPlayers: names,
      playerCount: names.length,
      matchesOrganized: false,
      bracketOrganized: false,
      bracketSize: mode === "KNOCKOUT" ? names.length : null,
      qualifiedIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    { merge: true },
  );

  await batch.commit();
}

/** Generates and stores the full round-robin schedule, one document per matchday. */
export async function organizeGroupMatches(players: Player[]): Promise<number> {
  const db = getDb();
  const matches = generateRoundRobin(players);
  const days = groupByMatchday(matches);

  // Chunked so a 100-player league (99 documents) stays inside batch limits.
  const CHUNK = 100;
  for (let i = 0; i < days.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const day of days.slice(i, i + CHUNK)) {
      const map: Record<string, Match> = {};
      for (const m of day.matches) map[m.id] = m;
      batch.set(doc(matchdaysCol(db), matchdayId(day.matchday)), {
        matchday: day.matchday,
        matches: map,
      } satisfies MatchdayDoc);
    }
    await batch.commit();
  }

  await updateDoc(leagueDoc(db), { matchesOrganized: true, updatedAt: Date.now() });
  return matches.length;
}

/** Writes one fixture's score. Editing an existing score uses the same path. */
export async function saveGroupResult(
  match: Match,
  scoreA: number,
  scoreB: number,
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(matchdaysCol(db), matchdayId(match.matchday)), {
    ["matches." + match.id + ".scoreA"]: scoreA,
    ["matches." + match.id + ".scoreB"]: scoreB,
  });
  await updateDoc(leagueDoc(db), { updatedAt: Date.now() });
}

/** Clears a fixture's score and takes it back to "not played". */
export async function clearGroupResult(match: Match): Promise<void> {
  const db = getDb();
  await updateDoc(doc(matchdaysCol(db), matchdayId(match.matchday)), {
    ["matches." + match.id + ".scoreA"]: null,
    ["matches." + match.id + ".scoreB"]: null,
  });
  await updateDoc(leagueDoc(db), { updatedAt: Date.now() });
}

/** Moves a finished group stage into the knockout phase. */
export async function startBracket(
  qualifiedIds: string[],
  bracketSize: number,
): Promise<void> {
  const db = getDb();
  await updateDoc(leagueDoc(db), {
    status: "KNOCKOUT",
    bracketSize,
    qualifiedIds,
    bracketOrganized: false,
    updatedAt: Date.now(),
  });
}

/** Draws the knockout tree. Refuses to run twice over an existing bracket. */
export async function organizeBracket(qualifiedIds: string[]): Promise<BracketDoc> {
  const db = getDb();
  const bracket = generateBracket(qualifiedIds);
  await setDoc(bracketDoc(db), bracket);
  await updateDoc(leagueDoc(db), {
    bracketOrganized: true,
    bracketSize: bracket.size,
    updatedAt: Date.now(),
  });
  return bracket;
}

/**
 * Stores a knockout result and, in the same write, clears any later result that
 * the change has invalidated - so a re-scored quarterfinal can never leave a
 * semifinal standing between players who no longer belong there.
 */
export async function saveBracketResult(
  matchId: string,
  result: { aId: string; bId: string; aGoals: number; bGoals: number },
  staleIds: string[],
): Promise<void> {
  const db = getDb();
  const updates: Record<string, unknown> = {
    ["matches." + matchId + ".result"]: result,
  };
  for (const id of staleIds) {
    if (id === matchId) continue;
    updates["matches." + id + ".result"] = null;
  }
  await updateDoc(bracketDoc(db), updates);
  await updateDoc(leagueDoc(db), { updatedAt: Date.now() });
}

/** Deletes everything and returns to a blank setup screen. */
export async function resetLeague(): Promise<void> {
  const db = getDb();

  const [players, matchdays] = await Promise.all([
    getDocs(playersCol(db)),
    getDocs(matchdaysCol(db)),
  ]);

  const refs = [...players.docs, ...matchdays.docs].map((d) => d.ref);
  const CHUNK = 400;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(i, i + CHUNK)) batch.delete(ref);
    await batch.commit();
  }

  await deleteDoc(bracketDoc(db)).catch(() => undefined);

  await setDoc(leagueDoc(db), {
    ...EMPTY_TOURNAMENT,
    qualifiedIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
