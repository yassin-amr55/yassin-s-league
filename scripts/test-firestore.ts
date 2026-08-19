/**
 * End-to-end database test against the Firestore emulator.
 *
 *   npm run emulator      (in one terminal)
 *   npx tsx scripts/test-firestore.ts
 *
 * This drives the same functions the UI calls - startLeague, organizeGroupMatches,
 * saveGroupResult, startBracket, organizeBracket, saveBracketResult, resetLeague -
 * and reads the data back through the real listeners, so it checks persistence
 * and live updates rather than just in-memory logic.
 */
process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||= "demo-api-key";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||= "demo-yassins-league.firebaseapp.com";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||= "demo-yassins-league";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||= "1:000000000000:web:demo";
process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";

import type { Unsubscribe } from "firebase/firestore";
import type { BracketDoc, Match, Player, Tournament } from "../src/lib/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) passed++;
  else {
    failed++;
    failures.push(name + (detail ? " -- " + detail : ""));
  }
}
function eq<T>(name: string, actual: T, expected: T) {
  check(name, Object.is(actual, expected), `expected ${String(expected)}, got ${String(actual)}`);
}
function section(title: string) {
  console.log("\n\x1b[1m" + title + "\x1b[0m");
}

async function main() {
  const db = await import("../src/lib/db");
  const { computeStandings } = await import("../src/lib/standings");
  const {
    bracketSizeFor,
    computePodium,
    isBracketComplete,
    isDirectKnockoutCount,
    qualifiedPlayerIds,
    resolveBracket,
    staleResultIds,
  } = await import("../src/lib/bracket");
  const { expectedFixtureCount, isMatchCompleted } = await import("../src/lib/schedule");

  /** Live snapshot of the whole league, kept up to date by real listeners. */
  const live = {
    tournament: null as Tournament | null,
    players: [] as Player[],
    matches: [] as Match[],
    bracket: null as BracketDoc | null,
    revision: 0,
  };

  const unsubs: Unsubscribe[] = [];
  const bump = () => {
    live.revision++;
  };
  const onErr = (label: string) => (err: unknown) => {
    console.error("listener error:", label, err);
    process.exitCode = 1;
  };

  unsubs.push(
    db.subscribeTournament((t) => {
      live.tournament = t;
      bump();
    }, onErr("tournament")),
    db.subscribePlayers((p) => {
      live.players = p;
      bump();
    }, onErr("players")),
    db.subscribeMatches((m) => {
      live.matches = m;
      bump();
    }, onErr("matches")),
    db.subscribeBracket((b) => {
      live.bracket = b;
      bump();
    }, onErr("bracket")),
  );

  /** Waits until the listeners report the state we expect (or times out). */
  async function until(label: string, predicate: () => boolean, timeoutMs = 45000) {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timed out waiting for: ${label}`);
      }
      await new Promise((r) => setTimeout(r, 60));
    }
  }

  const names = (n: number) =>
    Array.from({ length: n }, (_, i) => "Player " + String(i + 1).padStart(3, "0"));

  await db.resetLeague();
  await until("initial reset", () => live.tournament?.status === "SETUP" && live.players.length === 0);

  /* ---------------------------------------------- draft roster persistence */

  section("Setup persistence");
  await db.saveDraftPlayers(["Ahmad", "Yassin", "Mohamed"]);
  await until("draft saved", () => live.tournament?.draftPlayers.length === 3);
  eq("draft roster is stored in Firestore", live.tournament?.draftPlayers.join(","), "Ahmad,Yassin,Mohamed");

  /* --------------------------------------------------- full group flow */

  async function runGroupLeague(n: number) {
    section(`Group league with ${n} players`);
    await db.resetLeague();
    await until("reset", () => live.players.length === 0 && live.matches.length === 0 && !live.bracket);

    await db.startLeague(names(n), "GROUP");
    await until("league started", () => live.players.length === n && live.tournament?.status === "GROUP_STAGE");
    eq(`n=${n}: players persisted`, live.players.length, n);
    eq(`n=${n}: mode is GROUP`, live.tournament?.mode, "GROUP");
    check(`n=${n}: player ids are unique`, new Set(live.players.map((p) => p.id)).size === n);

    const written = await db.organizeGroupMatches(live.players);
    await until("fixtures organised", () => live.matches.length === expectedFixtureCount(n) && !!live.tournament?.matchesOrganized);
    eq(`n=${n}: fixtures written`, written, expectedFixtureCount(n));
    eq(`n=${n}: fixtures readable`, live.matches.length, expectedFixtureCount(n));
    eq(`n=${n}: fixture ids unique after round-trip`, new Set(live.matches.map((m) => m.id)).size, live.matches.length);

    const pairs = new Set(live.matches.map((m) => [m.playerAId, m.playerBId].sort().join("|")));
    eq(`n=${n}: no duplicate fixtures after round-trip`, pairs.size, expectedFixtureCount(n));

    // Score every fixture. Writes are chunked so a 100-player league stays sane.
    const CONCURRENCY = 25;
    for (let i = 0; i < live.matches.length; i += CONCURRENCY) {
      const slice = live.matches.slice(i, i + CONCURRENCY);
      await Promise.all(
        slice.map((m) => db.saveGroupResult(m, (m.index * 3) % 5, (m.index * 2) % 4)),
      );
    }
    await until(
      "all fixtures scored",
      () => live.matches.filter(isMatchCompleted).length === expectedFixtureCount(n),
      120000,
    );
    eq(`n=${n}: every result persisted`, live.matches.filter(isMatchCompleted).length, expectedFixtureCount(n));

    const table = computeStandings(live.players, live.matches);
    eq(`n=${n}: table has every player`, table.length, n);
    eq(`n=${n}: each player played n-1`, table.every((r) => r.played === n - 1) ? 1 : 0, 1);

    const size = bracketSizeFor(n)!;
    await db.startBracket(qualifiedPlayerIds(table, size), size);
    await until("bracket opened", () => live.tournament?.status === "KNOCKOUT");
    eq(`n=${n}: qualified count persisted`, live.tournament?.qualifiedIds.length, size);
    eq(`n=${n}: bracket size persisted`, live.tournament?.bracketSize, size);

    await db.organizeBracket(live.tournament!.qualifiedIds);
    await until("bracket drawn", () => !!live.bracket && !!live.tournament?.bracketOrganized);
    eq(`n=${n}: bracket size in doc`, live.bracket?.size, size);
    eq(`n=${n}: bracket participants unique`, new Set(live.bracket!.participants).size, size);

    await playOutBracket(n);
  }

  async function playOutBracket(label: number | string) {
    const byId = new Map(live.players.map((p) => [p.id, p]));
    let guard = 0;
    for (;;) {
      if (guard++ > 80) throw new Error("bracket did not converge");
      const resolved = resolveBracket(live.bracket!, byId);
      const next = resolved.find((m) => !m.completed && m.playerAId && m.playerBId);
      if (!next) break;
      const result = {
        aId: next.playerAId!,
        bId: next.playerBId!,
        aGoals: next.matchNumber % 2 === 0 ? 3 : 1,
        bGoals: next.matchNumber % 2 === 0 ? 1 : 3,
      };
      const candidate: BracketDoc = {
        ...live.bracket!,
        matches: {
          ...live.bracket!.matches,
          [next.id]: { ...live.bracket!.matches[next.id], result },
        },
      };
      const stale = staleResultIds(resolveBracket(candidate, byId));
      const before = live.revision;
      await db.saveBracketResult(next.id, result, stale);
      await until("bracket result " + next.id, () => live.revision > before);
    }

    const resolved = resolveBracket(live.bracket!, byId);
    check(`${label}: bracket completed`, isBracketComplete(resolved));
    eq(`${label}: no stale results`, staleResultIds(resolved).length, 0);

    const podium = computePodium(resolved, live.bracket!.size, byId);
    eq(`${label}: podium size`, podium.length, live.bracket!.size >= 4 ? 3 : 2);
    eq(`${label}: podium distinct`, new Set(podium.map((p) => p.playerId)).size, podium.length);
    check(`${label}: champion is a real player`, byId.has(podium[0].playerId));
  }

  for (const n of [3, 5, 6, 7, 9, 15, 17]) {
    await runGroupLeague(n);
  }

  /* ------------------------------------------- direct knockout mode */

  for (const n of [2, 4, 8, 16, 32]) {
    section(`Direct knockout with ${n} players`);
    check(`${n} is a direct-knockout count`, isDirectKnockoutCount(n));

    await db.resetLeague();
    await until("reset", () => live.players.length === 0 && !live.bracket);

    await db.startLeague(names(n), "KNOCKOUT");
    await until("knockout started", () => live.players.length === n && live.tournament?.status === "KNOCKOUT");
    eq(`n=${n}: no group fixtures created`, live.matches.length, 0);
    eq(`n=${n}: bracket size set at start`, live.tournament?.bracketSize, n);

    await db.organizeBracket(live.players.map((p) => p.id));
    await until("bracket drawn", () => !!live.bracket);
    eq(`n=${n}: everybody is in the draw`, live.bracket?.participants.length, n);

    await playOutBracket(n);
  }

  /* ------------------------------------------- editing a saved result */

  section("Editing results");
  await db.resetLeague();
  await until("reset", () => live.players.length === 0);
  await db.startLeague(["Ahmad", "Yassin", "Mohamed"], "GROUP");
  await until("started", () => live.players.length === 3);
  await db.organizeGroupMatches(live.players);
  await until("organised", () => live.matches.length === 3);

  const ahmad = live.players.find((p) => p.name === "Ahmad")!;
  const yassin = live.players.find((p) => p.name === "Yassin")!;
  const fixture = live.matches.find(
    (m) =>
      (m.playerAId === ahmad.id && m.playerBId === yassin.id) ||
      (m.playerAId === yassin.id && m.playerBId === ahmad.id),
  )!;
  const ahmadIsA = fixture.playerAId === ahmad.id;

  await db.saveGroupResult(fixture, ahmadIsA ? 4 : 3, ahmadIsA ? 3 : 4);
  await until("4-3 saved", () => live.matches.some((m) => m.id === fixture.id && m.scoreA !== null));
  {
    const table = computeStandings(live.players, live.matches);
    const a = table.find((r) => r.playerId === ahmad.id)!;
    eq("Ahmad has 3 points after 4-3", a.points, 3);
    eq("Ahmad GF 4", a.goalsFor, 4);
    eq("Ahmad GD +1", a.goalDifference, 1);
  }

  const stored = live.matches.find((m) => m.id === fixture.id)!;
  await db.saveGroupResult(stored, 2, 2);
  await until("2-2 saved", () => live.matches.some((m) => m.id === fixture.id && m.scoreA === 2 && m.scoreB === 2));
  {
    const table = computeStandings(live.players, live.matches);
    const a = table.find((r) => r.playerId === ahmad.id)!;
    const y = table.find((r) => r.playerId === yassin.id)!;
    eq("after edit Ahmad has 1 point", a.points, 1);
    eq("after edit Ahmad wins 0", a.wins, 0);
    eq("after edit Ahmad draws 1", a.draws, 1);
    eq("after edit Ahmad GF 2", a.goalsFor, 2);
    eq("after edit Ahmad GA 2", a.goalsAgainst, 2);
    eq("after edit Ahmad GD 0", a.goalDifference, 0);
    eq("after edit Yassin has 1 point", y.points, 1);
    eq("after edit nobody has 3 points", table.filter((r) => r.points === 3).length, 0);
    eq("after edit played count stays 1", a.played, 1);
  }

  const stored2 = live.matches.find((m) => m.id === fixture.id)!;
  await db.clearGroupResult(stored2);
  await until("cleared", () => live.matches.some((m) => m.id === fixture.id && m.scoreA === null));
  {
    const table = computeStandings(live.players, live.matches);
    eq("clearing a result removes it from the table", table.reduce((s, r) => s + r.played, 0), 0);
  }

  /* ------------------------- knockout edit invalidates downstream results */

  section("Knockout re-score");
  await db.resetLeague();
  await until("reset", () => live.players.length === 0 && !live.bracket);
  await db.startLeague(names(8), "KNOCKOUT");
  await until("started", () => live.players.length === 8);
  await db.organizeBracket(live.players.map((p) => p.id));
  await until("drawn", () => !!live.bracket);
  await playOutBracket("8 before re-score");

  {
    const byId = new Map(live.players.map((p) => [p.id, p]));
    const before = resolveBracket(live.bracket!, byId);
    const championBefore = computePodium(before, 8, byId)[0].playerId;
    const qf = before.find((m) => m.id === "r0s0")!;

    // Flip the first quarterfinal so the other player goes through.
    const flipped = {
      aId: qf.playerAId!,
      bId: qf.playerBId!,
      aGoals: qf.winnerId === qf.playerAId ? 0 : 6,
      bGoals: qf.winnerId === qf.playerAId ? 6 : 0,
    };
    const candidate: BracketDoc = {
      ...live.bracket!,
      matches: { ...live.bracket!.matches, r0s0: { ...live.bracket!.matches.r0s0, result: flipped } },
    };
    const stale = staleResultIds(resolveBracket(candidate, byId));
    check("re-scoring a quarterfinal marks later ties stale", stale.length > 0, stale.join(","));

    const rev = live.revision;
    await db.saveBracketResult("r0s0", flipped, stale);
    await until("re-score saved", () => live.revision > rev);

    const after = resolveBracket(live.bracket!, byId);
    eq("stale results were cleared in Firestore", staleResultIds(after).length, 0);
    check("the bracket is incomplete again", !isBracketComplete(after));
    const semi = after.find((m) => m.id === "r1s0")!;
    check("the semifinal now has the new qualifier", semi.playerAId === (flipped.aGoals > flipped.bGoals ? flipped.aId : flipped.bId));
    check("the semifinal result was wiped", !semi.completed);

    await playOutBracket("8 after re-score");
    const byId2 = new Map(live.players.map((p) => [p.id, p]));
    const finalResolved = resolveBracket(live.bracket!, byId2);
    const championAfter = computePodium(finalResolved, 8, byId2)[0].playerId;
    check("a champion is decided again after the edit", !!championAfter);
    check(
      "champion is one of the eight players",
      live.players.some((p) => p.id === championAfter) && !!championBefore,
    );
  }

  /* ------------------------------------------------------ reset league */

  section("Reset");
  await db.resetLeague();
  // Every listener must converge, not just the ones that fire first.
  await until(
    "reset complete",
    () =>
      live.players.length === 0 &&
      live.matches.length === 0 &&
      !live.bracket &&
      live.tournament?.status === "SETUP" &&
      live.tournament.draftPlayers.length === 0,
  );
  eq("reset clears players", live.players.length, 0);
  eq("reset clears fixtures", live.matches.length, 0);
  eq("reset clears the bracket", live.bracket, null);
  eq("reset returns to SETUP", live.tournament?.status, "SETUP");
  eq("reset clears the draft roster", live.tournament?.draftPlayers.length, 0);

  for (const u of unsubs) u();

  console.log("");
  if (failed === 0) {
    console.log(`\x1b[32m✓ all ${passed} Firestore checks passed\x1b[0m`);
  } else {
    console.log(`\x1b[31m✗ ${failed} of ${passed + failed} Firestore checks failed\x1b[0m`);
    for (const f of failures) console.log("  - " + f);
    process.exitCode = 1;
  }
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (err) => {
    console.error("\x1b[31mFatal:\x1b[0m", err);
    process.exit(1);
  },
);
