"use client";

import { useEffect, useMemo, useState } from "react";
import type { Unsubscribe } from "firebase/firestore";
import {
  subscribeBracket,
  subscribeMatches,
  subscribePlayers,
  subscribeTournament,
} from "@/lib/db";
import { friendlyFirestoreError, isFirebaseConfigured, missingFirebaseEnv } from "@/lib/firebase";
import { buildLeagueView, EMPTY_TOURNAMENT, type LeagueView } from "@/lib/tournament";
import type { BracketDoc, Match, Player, Tournament } from "@/lib/types";

export interface LeagueState {
  view: LeagueView;
  loading: boolean;
  /** Set when Firestore cannot be reached or is not configured. */
  error: string | null;
  configured: boolean;
  missingEnv: string[];
}

/**
 * Subscribes to the whole league and derives the read-model.
 *
 * Four listeners, all scoped to the single active league, so an admin score
 * change shows up in the player view without a refresh. Fixtures arrive grouped
 * by matchday, which keeps even a 100-player league to ~99 documents.
 */
export function useLeague(): LeagueState {
  const [tournament, setTournament] = useState<Tournament>(EMPTY_TOURNAMENT);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [bracket, setBracket] = useState<BracketDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState({
    tournament: false,
    players: false,
    matches: false,
    bracket: false,
  });

  const configured = isFirebaseConfigured();

  useEffect(() => {
    if (!configured) return;

    const unsubscribers: Unsubscribe[] = [];
    const fail = (context: string) => (err: unknown) => {
      console.error("[Yassin's League] " + context, err);
      setError(
        friendlyFirestoreError(err, "Could not load the league. Please refresh and try again."),
      );
    };

    try {
      unsubscribers.push(
        subscribeTournament((data) => {
          setTournament(data);
          setReady((r) => (r.tournament ? r : { ...r, tournament: true }));
        }, fail("tournament")),
        subscribePlayers((data) => {
          setPlayers(data);
          setReady((r) => (r.players ? r : { ...r, players: true }));
        }, fail("players")),
        subscribeMatches((data) => {
          setMatches(data);
          setReady((r) => (r.matches ? r : { ...r, matches: true }));
        }, fail("matches")),
        subscribeBracket((data) => {
          setBracket(data);
          setReady((r) => (r.bracket ? r : { ...r, bracket: true }));
        }, fail("bracket")),
      );
    } catch (err) {
      fail("connection")(err);
    }

    return () => {
      for (const unsub of unsubscribers) unsub();
    };
  }, [configured]);

  const view = useMemo(
    () => buildLeagueView(tournament, players, matches, bracket),
    [tournament, players, matches, bracket],
  );

  const loading =
    configured &&
    !error &&
    !(ready.tournament && ready.players && ready.matches && ready.bracket);

  return {
    view,
    loading,
    error,
    configured,
    missingEnv: configured ? [] : missingFirebaseEnv(),
  };
}
