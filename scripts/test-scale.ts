/**
 * Scale test: the largest league the app allows.
 *
 *   npm run emulator
 *   npx tsx scripts/test-scale.ts
 *
 * 100 players means 4,950 fixtures. This checks that they are written, read
 * back and scored correctly, that the matchday documents stay far below the
 * 1 MB Firestore limit, and that a full 32-player bracket follows on the end.
 */
process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||= "demo-api-key";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||= "demo-yassins-league.firebaseapp.com";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||= "demo-yassins-league";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||= "1:000000000000:web:demo";
process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";

import { collection, getDocs, type Unsubscribe } from "firebase/firestore";
import type { BracketDoc, Match, Player, Tournament } from "../src/lib/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else {
    failed++;
    failures.push(name + (detail ? " -- " + detail : ""));
  }
};
const eq = <T,>(name: string, actual: T, expected: T) =>
  check(name, Object.is(actual, expected), `expected ${String(expected)}, got ${String(actual)}`);

const ms = (start: number) => ((Date.now() - start) / 1000).toFixed(1) + "s";

async function main() {
  const db = await import("../src/lib/db");
  const { getDb } = await import("../src/lib/firebase");
  const { computeStandings } = await import("../src/lib/standings");
  const {
    bracketSizeFor,
    computePodium,
    isBracketComplete,
    qualifiedPlayerIds,
    resolveBracket,
    staleResultIds,
  } = await import("../src/lib/bracket");
  const { expectedFixtureCount, isMatchCompleted } = await import("../src/lib/schedule");

  const live = {
    tournament: null as Tournament | null,
    players: [] as Player[],
    matches: [] as Match[],
    bracket: null as BracketDoc | null,
    revision: 0,
  };
  const bump = () => void live.revision++;
  const onErr = (l: string) => (e: unknown) => console.error("listener " + l, e);

  const unsubs: Unsubscribe[] = [
    db.subscribeTournament((t) => ((live.tournament = t), bump()), onErr("tournament")),
    db.subscribePlayers((p) => ((live.players = p), bump()), onErr("players")),
    db.subscribeMatches((m) => ((live.matches = m), bump()), onErr("matches")),
    db.subscribeBracket((b) => ((live.bracket = b), bump()), onErr("bracket")),
  ];

  async function until(label: string, predicate: () => boolean, timeoutMs = 300000) {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for: " + label);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const N = 100;
  const names = Array.from({ length: N }, (_, i) => "Player " + String(i + 1).padStart(3, "0"));
  const expected = expectedFixtureCount(N);

  console.log(`\n\x1b[1mScale test: ${N} players, ${expected} fixtures\x1b[0m`);

  await db.resetLeague();
  await until("reset", () => live.players.length === 0 && live.matches.length === 0 && !live.bracket);

  let t = Date.now();
  await db.startLeague(names, "GROUP");
  await until("started", () => live.players.length === N);
  console.log(`  start league ......... ${ms(t)}`);
  eq("100 players persisted", live.players.length, N);

  t = Date.now();
  const written = await db.organizeGroupMatches(live.players);
  await until("organised", () => live.matches.length === expected, 180000);
  console.log(`  organise ${expected} fixtures .. ${ms(t)}`);
  eq("4950 fixtures generated", written, expected);
  eq("4950 fixtures readable", live.matches.length, expected);

  // Document sizing: the reason fixtures are grouped by matchday.
  const snap = await getDocs(collection(getDb(), "leagues", "current", "matchdays"));
  eq("99 matchday documents", snap.size, N - 1);
  let biggest = 0;
  for (const d of snap.docs) {
    biggest = Math.max(biggest, JSON.stringify(d.data()).length);
  }
  console.log(`  largest matchday doc .. ${(biggest / 1024).toFixed(1)} KB`);
  check("matchday documents stay well under the 1 MB limit", biggest < 200_000, biggest + " bytes");

  const pairs = new Set(live.matches.map((m) => [m.playerAId, m.playerBId].sort().join("|")));
  eq("no duplicate fixtures at scale", pairs.size, expected);
  const perDay = new Map<number, Set<string>>();
  let clashes = 0;
  for (const m of live.matches) {
    const used = perDay.get(m.matchday) ?? new Set<string>();
    if (used.has(m.playerAId) || used.has(m.playerBId)) clashes++;
    used.add(m.playerAId);
    used.add(m.playerBId);
    perDay.set(m.matchday, used);
  }
  eq("no player has two fixtures in a matchday at scale", clashes, 0);
  eq("99 matchdays", perDay.size, N - 1);

  // Score every fixture through the real save path.
  t = Date.now();
  const CONCURRENCY = 60;
  const all = [...live.matches];
  for (let i = 0; i < all.length; i += CONCURRENCY) {
    await Promise.all(
      all.slice(i, i + CONCURRENCY).map((m) => db.saveGroupResult(m, m.index % 6, (m.index * 3) % 5)),
    );
    if (i % 1200 === 0 && i > 0) process.stdout.write(`    scored ${i}/${all.length}\r`);
  }
  await until("all scored", () => live.matches.filter(isMatchCompleted).length === expected, 300000);
  console.log(`  score ${expected} fixtures ..... ${ms(t)}          `);
  eq("every fixture has a result", live.matches.filter(isMatchCompleted).length, expected);

  t = Date.now();
  const table = computeStandings(live.players, live.matches);
  console.log(`  compute standings ..... ${ms(t)}`);
  eq("table has 100 rows", table.length, N);
  eq("everyone played 99 fixtures", table.every((r) => r.played === N - 1) ? 1 : 0, 1);
  eq("points equal 3W + D", table.every((r) => r.points === r.wins * 3 + r.draws) ? 1 : 0, 1);
  eq(
    "table sorted by points then GD",
    table.every((row, i) =>
      i === 0
        ? true
        : table[i - 1].points > row.points ||
          (table[i - 1].points === row.points && table[i - 1].goalDifference >= row.goalDifference),
    )
      ? 1
      : 0,
    1,
  );

  const size = bracketSizeFor(N)!;
  eq("100 players qualify a bracket of 32", size, 32);

  await db.startBracket(qualifiedPlayerIds(table, size), size);
  await until("bracket opened", () => live.tournament?.qualifiedIds.length === size);
  await db.organizeBracket(live.tournament!.qualifiedIds);
  await until("bracket drawn", () => !!live.bracket);
  eq("32 players in the draw", live.bracket?.participants.length, 32);
  check(
    "only top-32 players are in the draw",
    live.bracket!.participants.every((id) => table.slice(0, 32).some((r) => r.playerId === id)),
  );

  t = Date.now();
  const byId = new Map(live.players.map((p) => [p.id, p]));
  let guard = 0;
  for (;;) {
    if (guard++ > 100) throw new Error("bracket did not converge");
    const resolved = resolveBracket(live.bracket!, byId);
    const next = resolved.find((m) => !m.completed && m.playerAId && m.playerBId);
    if (!next) break;
    const result = {
      aId: next.playerAId!,
      bId: next.playerBId!,
      aGoals: next.matchNumber % 3 === 0 ? 1 : 4,
      bGoals: next.matchNumber % 3 === 0 ? 4 : 1,
    };
    const candidate: BracketDoc = {
      ...live.bracket!,
      matches: { ...live.bracket!.matches, [next.id]: { ...live.bracket!.matches[next.id], result } },
    };
    const rev = live.revision;
    await db.saveBracketResult(next.id, result, staleResultIds(resolveBracket(candidate, byId)));
    await until("tie " + next.id, () => live.revision > rev);
  }
  console.log(`  play 32-player bracket  ${ms(t)}`);

  const resolved = resolveBracket(live.bracket!, byId);
  check("32-player bracket completed", isBracketComplete(resolved));
  eq("32-player bracket has 32 ties (31 + third place)", resolved.length, 32);
  const podium = computePodium(resolved, 32, byId);
  eq("podium has three places", podium.length, 3);
  eq("podium entries are distinct", new Set(podium.map((p) => p.playerId)).size, 3);
  console.log(
    `  champion: ${podium[0].playerName} | runner-up: ${podium[1].playerName} | third: ${podium[2].playerName}`,
  );

  await db.resetLeague();
  await until(
    "final reset",
    () =>
      live.players.length === 0 &&
      live.matches.length === 0 &&
      !live.bracket &&
      live.tournament?.status === "SETUP",
    180000,
  );
  eq("reset clears a 100-player league", live.matches.length, 0);

  for (const u of unsubs) u();

  console.log("");
  if (failed === 0) console.log(`\x1b[32m✓ all ${passed} scale checks passed\x1b[0m`);
  else {
    console.log(`\x1b[31m✗ ${failed} of ${passed + failed} scale checks failed\x1b[0m`);
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
