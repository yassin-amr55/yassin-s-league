/**
 * Logic test suite for Yassin's League.
 *
 *   npm test
 *
 * Covers the parts that are easy to get quietly wrong: round-robin generation,
 * standings recalculation after an edit, qualification sizing, and knockout
 * progression including third place and stale-result invalidation.
 */
import { generateRoundRobin, groupByMatchday, expectedFixtureCount } from "../src/lib/schedule";
import { computeStandings } from "../src/lib/standings";
import {
  BRACKET_SIZES,
  bracketSizeFor,
  computePodium,
  generateBracket,
  isBracketComplete,
  isDirectKnockoutCount,
  resolveBracket,
  roundNameFor,
  staleResultIds,
  qualifiedPlayerIds,
  THIRD_PLACE_ID,
} from "../src/lib/bracket";
import { validateRoster, parseGoals, validateScore, normalizeName } from "../src/lib/validation";
import type { BracketDoc, Match, Player } from "../src/lib/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(`${name}${detail ? " -- " + detail : ""}`);
  }
}

function eq<T>(name: string, actual: T, expected: T) {
  check(name, Object.is(actual, expected), `expected ${String(expected)}, got ${String(actual)}`);
}

function section(title: string) {
  console.log("\n\x1b[1m" + title + "\x1b[0m");
}

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: "p" + i,
    name: "Player " + String(i + 1).padStart(3, "0"),
    order: i,
  }));
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join("|");
}

/* ------------------------------------------------- 1. round-robin schedule */

section("Round-robin schedule");

const scheduleCounts = [2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 16, 17, 20, 31, 32, 33, 50, 64, 99, 100];

for (const n of scheduleCounts) {
  const players = makePlayers(n);
  const matches = generateRoundRobin(players);
  const expected = expectedFixtureCount(n);

  eq(`n=${n}: fixture count is n*(n-1)/2`, matches.length, expected);

  // Every pair exactly once, nobody plays themselves.
  const seen = new Map<string, number>();
  let selfMatches = 0;
  for (const m of matches) {
    if (m.playerAId === m.playerBId) selfMatches++;
    const key = pairKey(m.playerAId, m.playerBId);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  eq(`n=${n}: no self matches`, selfMatches, 0);
  eq(`n=${n}: no duplicate pairings`, [...seen.values()].filter((c) => c > 1).length, 0);
  eq(`n=${n}: distinct pairings equals total`, seen.size, expected);

  // Every possible pair is present.
  let missing = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!seen.has(pairKey(players[i].id, players[j].id))) missing++;
    }
  }
  eq(`n=${n}: every player meets every other player`, missing, 0);

  // Nobody is scheduled twice on the same matchday.
  const days = groupByMatchday(matches);
  let clashes = 0;
  for (const day of days) {
    const used = new Set<string>();
    for (const m of day.matches) {
      if (used.has(m.playerAId) || used.has(m.playerBId)) clashes++;
      used.add(m.playerAId);
      used.add(m.playerBId);
    }
  }
  eq(`n=${n}: no player has two fixtures in one matchday`, clashes, 0);

  // Matchdays numbered 1..k with no gaps; global index 1..total with no gaps.
  const dayNumbers = days.map((d) => d.matchday);
  check(
    `n=${n}: matchdays are numbered 1..${days.length} without gaps`,
    dayNumbers.every((d, i) => d === i + 1),
    JSON.stringify(dayNumbers.slice(0, 6)),
  );
  eq(`n=${n}: matchday count`, days.length, n % 2 === 0 ? n - 1 : n);

  const indexes = matches.map((m) => m.index).sort((a, b) => a - b);
  check(
    `n=${n}: match numbers are 1..${expected} without gaps`,
    indexes.every((v, i) => v === i + 1),
  );

  // Fixture ids are unique.
  eq(`n=${n}: fixture ids unique`, new Set(matches.map((m) => m.id)).size, matches.length);
}

// Randomisation: the same roster should not produce the same order twice.
{
  const players = makePlayers(12);
  const a = generateRoundRobin(players).map((m) => m.playerAId + ">" + m.playerBId).join(",");
  const b = generateRoundRobin(players).map((m) => m.playerAId + ">" + m.playerBId).join(",");
  check("schedule is randomised between runs", a !== b);
}

eq("fewer than 2 players produces no fixtures", generateRoundRobin(makePlayers(1)).length, 0);

/* -------------------------------------------------------- 2. standings */

section("Standings");

{
  const players: Player[] = [
    { id: "a", name: "Ahmad", order: 0 },
    { id: "y", name: "Yassin", order: 1 },
  ];
  const match: Match = {
    id: "m1",
    index: 1,
    matchday: 1,
    playerAId: "a",
    playerBId: "y",
    scoreA: 4,
    scoreB: 3,
  };

  const table = computeStandings(players, [match]);
  const ahmad = table.find((r) => r.playerId === "a")!;
  const yassin = table.find((r) => r.playerId === "y")!;

  eq("Ahmad 4-3 Yassin: Ahmad position", ahmad.position, 1);
  eq("Ahmad 4-3 Yassin: Ahmad played", ahmad.played, 1);
  eq("Ahmad 4-3 Yassin: Ahmad wins", ahmad.wins, 1);
  eq("Ahmad 4-3 Yassin: Ahmad draws", ahmad.draws, 0);
  eq("Ahmad 4-3 Yassin: Ahmad losses", ahmad.losses, 0);
  eq("Ahmad 4-3 Yassin: Ahmad GF", ahmad.goalsFor, 4);
  eq("Ahmad 4-3 Yassin: Ahmad GA", ahmad.goalsAgainst, 3);
  eq("Ahmad 4-3 Yassin: Ahmad GD", ahmad.goalDifference, 1);
  eq("Ahmad 4-3 Yassin: Ahmad points", ahmad.points, 3);
  eq("Ahmad 4-3 Yassin: Yassin losses", yassin.losses, 1);
  eq("Ahmad 4-3 Yassin: Yassin GF", yassin.goalsFor, 3);
  eq("Ahmad 4-3 Yassin: Yassin GA", yassin.goalsAgainst, 4);
  eq("Ahmad 4-3 Yassin: Yassin GD", yassin.goalDifference, -1);
  eq("Ahmad 4-3 Yassin: Yassin points", yassin.points, 0);

  // Edit the same fixture to 2-2 - the old 4-3 must leave no trace.
  const edited = computeStandings(players, [{ ...match, scoreA: 2, scoreB: 2 }]);
  for (const row of edited) {
    eq(`edited to 2-2: ${row.playerName} played`, row.played, 1);
    eq(`edited to 2-2: ${row.playerName} wins`, row.wins, 0);
    eq(`edited to 2-2: ${row.playerName} draws`, row.draws, 1);
    eq(`edited to 2-2: ${row.playerName} losses`, row.losses, 0);
    eq(`edited to 2-2: ${row.playerName} GF`, row.goalsFor, 2);
    eq(`edited to 2-2: ${row.playerName} GA`, row.goalsAgainst, 2);
    eq(`edited to 2-2: ${row.playerName} GD`, row.goalDifference, 0);
    eq(`edited to 2-2: ${row.playerName} points`, row.points, 1);
  }
}

{
  // Unplayed fixtures contribute nothing.
  const players = makePlayers(4);
  const matches = generateRoundRobin(players);
  const table = computeStandings(players, matches);
  eq("unplayed fixtures leave every stat at zero", table.reduce((s, r) => s + r.played + r.points + r.goalsFor, 0), 0);
  eq("every player appears in the table", table.length, 4);
}

{
  // Sorting: points, then GD, then GF, then name.
  const players: Player[] = [
    { id: "1", name: "Alpha", order: 0 },
    { id: "2", name: "Bravo", order: 1 },
    { id: "3", name: "Charlie", order: 2 },
    { id: "4", name: "Delta", order: 3 },
  ];
  const matches: Match[] = [
    // Bravo wins big, Charlie wins small -> equal points, Bravo ahead on GD.
    { id: "m1", index: 1, matchday: 1, playerAId: "2", playerBId: "1", scoreA: 5, scoreB: 0 },
    { id: "m2", index: 2, matchday: 1, playerAId: "3", playerBId: "4", scoreA: 1, scoreB: 0 },
  ];
  const table = computeStandings(players, matches);
  eq("higher GD ranks above lower GD at equal points", table[0].playerId, "2");
  eq("second place on GD", table[1].playerId, "3");
  eq("goal difference computed", table[0].goalDifference, 5);

  // Equal points and GD -> higher GF wins.
  const matches2: Match[] = [
    { id: "m1", index: 1, matchday: 1, playerAId: "2", playerBId: "1", scoreA: 3, scoreB: 2 },
    { id: "m2", index: 2, matchday: 1, playerAId: "3", playerBId: "4", scoreA: 1, scoreB: 0 },
  ];
  const table2 = computeStandings(players, matches2);
  eq("equal points and GD: higher GF ranks first", table2[0].playerId, "2");

  // Everything equal -> alphabetical, and the order is stable across calls.
  const allEqual = computeStandings(players, []);
  eq("all-equal fallback is alphabetical", allEqual.map((r) => r.playerName).join(","), "Alpha,Bravo,Charlie,Delta");
  const allEqualAgain = computeStandings([...players].reverse(), []);
  eq(
    "all-equal fallback is deterministic regardless of input order",
    allEqualAgain.map((r) => r.playerName).join(","),
    "Alpha,Bravo,Charlie,Delta",
  );
}

{
  // Full league simulation: totals must reconcile.
  const players = makePlayers(9);
  const matches = generateRoundRobin(players).map((m, i) => ({
    ...m,
    scoreA: i % 3,
    scoreB: (i + 1) % 4,
  }));
  const table = computeStandings(players, matches);
  const totalPlayed = table.reduce((s, r) => s + r.played, 0);
  const totalGF = table.reduce((s, r) => s + r.goalsFor, 0);
  const totalGA = table.reduce((s, r) => s + r.goalsAgainst, 0);
  eq("9 players: sum of played is 2x fixtures", totalPlayed, matches.length * 2);
  eq("9 players: total GF equals total GA", totalGF, totalGA);
  eq("9 players: each player played 8 games", table.every((r) => r.played === 8) ? 8 : -1, 8);
  eq("9 players: W+D+L equals played", table.every((r) => r.wins + r.draws + r.losses === r.played) ? 1 : 0, 1);
  eq(
    "9 players: points equal 3W + D",
    table.every((r) => r.points === r.wins * 3 + r.draws) ? 1 : 0,
    1,
  );
  check(
    "9 players: table is sorted by points then GD",
    table.every((row, i) => {
      if (i === 0) return true;
      const prev = table[i - 1];
      return (
        prev.points > row.points ||
        (prev.points === row.points && prev.goalDifference >= row.goalDifference)
      );
    }),
  );
}

/* --------------------------------------------------- 3. qualification */

section("Qualification sizing");

const expectedSizes: Array<[number, number]> = [
  [2, 2], [3, 2], [4, 4], [5, 4], [6, 4], [7, 4], [8, 8], [9, 8], [15, 8],
  [16, 16], [17, 16], [31, 16], [32, 32], [33, 32], [50, 32], [99, 32], [100, 32],
];
for (const [count, size] of expectedSizes) {
  eq(`${count} players -> bracket of ${size}`, bracketSizeFor(count), size as never);
}
eq("1 player -> no bracket", bracketSizeFor(1), null);

for (let n = 2; n <= 100; n++) {
  const size = bracketSizeFor(n)!;
  const allowed = BRACKET_SIZES as readonly number[];
  const larger = allowed.filter((s) => s > size && s <= n);
  check(
    `n=${n}: bracket size is the largest allowed size <= n`,
    allowed.includes(size) && size <= n && larger.length === 0,
    `got ${size}`,
  );
}

for (const n of [2, 4, 8, 16, 32]) {
  check(`n=${n} skips the group stage`, isDirectKnockoutCount(n));
}
for (const n of [3, 5, 6, 7, 9, 10, 15, 17, 31, 33, 50, 100]) {
  check(`n=${n} plays a group stage`, !isDirectKnockoutCount(n));
}

/* ------------------------------------------------------- 4. bracket */

section("Bracket generation and progression");

function playBracket(size: number, opts: { verbose?: boolean } = {}) {
  const players = makePlayers(size);
  const byId = new Map(players.map((p) => [p.id, p]));
  const bracket: BracketDoc = generateBracket(players.map((p) => p.id));

  eq(`size ${size}: bracket size stored`, bracket.size, size);
  eq(`size ${size}: participants unique`, new Set(bracket.participants).size, size);
  eq(
    `size ${size}: match count is size-1 plus third place`,
    Object.keys(bracket.matches).length,
    size >= 4 ? size - 1 + 1 : size - 1,
  );

  // First-round participants: everybody exactly once, nobody twice.
  const firstRound = Object.values(bracket.matches).filter((m) => m.round === 0 && !m.isThirdPlace);
  const seeded = firstRound.flatMap((m) => [m.seedAId!, m.seedBId!]);
  eq(`size ${size}: first round seats every player once`, new Set(seeded).size, size);
  eq(`size ${size}: first round has size/2 ties`, firstRound.length, size / 2);

  // Play every round in order, always giving the win to the higher-numbered id.
  let guard = 0;
  for (;;) {
    if (guard++ > 100) throw new Error("bracket did not converge");
    const resolved = resolveBracket(bracket, byId);
    const next = resolved.find((m) => !m.completed && m.playerAId && m.playerBId);
    if (!next) break;
    const aNum = Number(next.playerAId!.slice(1));
    const bNum = Number(next.playerBId!.slice(1));
    bracket.matches[next.id].result = {
      aId: next.playerAId!,
      bId: next.playerBId!,
      aGoals: aNum > bNum ? 2 : 1,
      bGoals: aNum > bNum ? 1 : 2,
    };
  }

  const resolved = resolveBracket(bracket, byId);
  check(`size ${size}: every tie was played`, isBracketComplete(resolved));
  eq(`size ${size}: no stale results`, staleResultIds(resolved).length, 0);

  // A player must never appear twice inside the same round.
  const rounds = Math.log2(size);
  for (let r = 0; r < rounds; r++) {
    const inRound = resolved.filter((m) => m.round === r && !m.isThirdPlace);
    const ids = inRound.flatMap((m) => [m.playerAId!, m.playerBId!]);
    eq(`size ${size}: round ${r} has no repeated player`, new Set(ids).size, ids.length);
    eq(`size ${size}: round ${r} tie count`, inRound.length, size / 2 ** (r + 1));
  }

  // Winners really do feed the next round.
  for (let r = 1; r < rounds; r++) {
    const inRound = resolved.filter((m) => m.round === r && !m.isThirdPlace);
    for (const m of inRound) {
      const feedA = resolved.find((x) => x.round === r - 1 && x.slot === m.slot * 2 && !x.isThirdPlace)!;
      const feedB = resolved.find((x) => x.round === r - 1 && x.slot === m.slot * 2 + 1 && !x.isThirdPlace)!;
      check(`size ${size}: r${r}s${m.slot} A is the winner of its feeder`, m.playerAId === feedA.winnerId);
      check(`size ${size}: r${r}s${m.slot} B is the winner of its feeder`, m.playerBId === feedB.winnerId);
    }
  }

  const podium = computePodium(resolved, size, byId);
  eq(`size ${size}: podium places`, podium.length, size >= 4 ? 3 : 2);
  eq(`size ${size}: podium entries are distinct`, new Set(podium.map((p) => p.playerId)).size, podium.length);

  if (size >= 4) {
    // The third-place tie is contested by the two semifinal losers.
    const semiRound = rounds - 2;
    const semis = resolved.filter((m) => m.round === semiRound && !m.isThirdPlace);
    const third = resolved.find((m) => m.isThirdPlace)!;
    const semiLosers = new Set(semis.map((m) => m.loserId));
    check(
      `size ${size}: third-place tie uses the semifinal losers`,
      semiLosers.has(third.playerAId) && semiLosers.has(third.playerBId) && third.playerAId !== third.playerBId,
    );
    check(
      `size ${size}: champion did not play for third place`,
      third.playerAId !== podium[0].playerId && third.playerBId !== podium[0].playerId,
    );
  } else {
    eq(`size ${size}: no third-place tie for a 2-player bracket`, resolved.filter((m) => m.isThirdPlace).length, 0);
  }

  // Highest id should win everything given the rule above.
  eq(`size ${size}: expected champion`, podium[0].playerId, "p" + (size - 1));

  if (opts.verbose) {
    console.log(
      "   " + resolved.map((m) => `#${m.matchNumber} ${m.roundName}`).join(" | "),
    );
  }
  return { bracket, byId, resolved };
}

for (const size of [2, 4, 8, 16, 32]) {
  playBracket(size);
}

// Round naming
eq("32-bracket round 0 name", roundNameFor(32, 0), "Round of 32");
eq("32-bracket round 1 name", roundNameFor(32, 1), "Round of 16");
eq("32-bracket round 2 name", roundNameFor(32, 2), "Quarterfinals");
eq("32-bracket round 3 name", roundNameFor(32, 3), "Semifinals");
eq("32-bracket round 4 name", roundNameFor(32, 4), "Final");
eq("8-bracket round 0 name", roundNameFor(8, 0), "Quarterfinals");
eq("2-bracket round 0 name", roundNameFor(2, 0), "Final");

// Placeholders before a feeder is played.
{
  const players = makePlayers(8);
  const byId = new Map(players.map((p) => [p.id, p]));
  const bracket = generateBracket(players.map((p) => p.id));
  const resolved = resolveBracket(bracket, byId);
  const semi = resolved.find((m) => m.round === 1 && m.slot === 0)!;
  check("undecided semifinal shows a Winner-of placeholder", semi.labelA.startsWith("Winner of Match"));
  check("undecided semifinal has no participants", semi.playerAId === null && semi.playerBId === null);
  const third = resolved.find((m) => m.isThirdPlace)!;
  check("undecided third place shows a Loser-of placeholder", third.labelA.startsWith("Loser of Match"));
  check("no invented player names in later rounds", !players.some((p) => semi.labelA === p.name));
}

// A drawn knockout score advances nobody.
{
  const players = makePlayers(4);
  const byId = new Map(players.map((p) => [p.id, p]));
  const bracket = generateBracket(players.map((p) => p.id));
  const first = Object.values(bracket.matches).find((m) => m.round === 0 && m.slot === 0)!;
  bracket.matches[first.id].result = {
    aId: first.seedAId!,
    bId: first.seedBId!,
    aGoals: 2,
    bGoals: 2,
  };
  const resolved = resolveBracket(bracket, byId);
  const played = resolved.find((m) => m.id === first.id)!;
  check("a tied knockout score does not complete the tie", !played.completed);
  eq("a tied knockout score produces no winner", played.winnerId, null);
}

// Editing an early result invalidates the results that depended on it.
{
  const { bracket, byId } = playBracket(8);
  const r0 = bracket.matches["r0s0"];
  const previousWinner = r0.result!.aGoals > r0.result!.bGoals ? r0.result!.aId : r0.result!.bId;

  // Flip the quarterfinal so the other player goes through.
  bracket.matches["r0s0"].result = {
    aId: r0.result!.aId,
    bId: r0.result!.bId,
    aGoals: r0.result!.aGoals > r0.result!.bGoals ? 0 : 5,
    bGoals: r0.result!.aGoals > r0.result!.bGoals ? 5 : 0,
  };

  const resolved = resolveBracket(bracket, byId);
  const stale = staleResultIds(resolved);
  check("flipping a quarterfinal invalidates the semifinal result", stale.includes("r1s0"), stale.join(","));

  const semi = resolved.find((m) => m.id === "r1s0")!;
  check("invalidated semifinal is not treated as completed", !semi.completed);
  check("invalidated semifinal has the new qualifier", semi.playerAId !== previousWinner);

  const finalMatch = resolved.find((m) => m.round === 2 && !m.isThirdPlace)!;
  check("final no longer has a decided participant from the broken branch", finalMatch.playerAId === null);

  // Clearing the stale results (what the app writes) leaves a consistent tree.
  for (const id of stale) bracket.matches[id].result = null;
  const afterCleanup = resolveBracket(bracket, byId);
  eq("after clearing, nothing is stale", staleResultIds(afterCleanup).length, 0);
  check("after clearing, the bracket is incomplete again", !isBracketComplete(afterCleanup));
}

// Third-place result is invalidated too when a semifinal changes.
{
  const { bracket, byId } = playBracket(4);
  const semi = bracket.matches["r0s0"];
  bracket.matches["r0s0"].result = {
    aId: semi.result!.aId,
    bId: semi.result!.bId,
    aGoals: semi.result!.aGoals > semi.result!.bGoals ? 0 : 7,
    bGoals: semi.result!.aGoals > semi.result!.bGoals ? 7 : 0,
  };
  const resolved = resolveBracket(bracket, byId);
  const stale = staleResultIds(resolved);
  check("flipping a semifinal invalidates the third-place result", stale.includes(THIRD_PLACE_ID), stale.join(","));
  check("flipping a semifinal invalidates the final result", stale.includes("r1s0"), stale.join(","));
}

/* ------------------------------------ 5. group stage feeding the bracket */

section("Group stage into bracket");

for (const n of [3, 5, 6, 7, 9, 10, 15, 17, 31, 33, 50, 100]) {
  const players = makePlayers(n);
  const byId = new Map(players.map((p) => [p.id, p]));
  const matches = generateRoundRobin(players).map((m, i) => ({
    ...m,
    scoreA: (i * 7) % 5,
    scoreB: (i * 3) % 4,
  }));
  const table = computeStandings(players, matches);
  const size = bracketSizeFor(n)!;
  const qualified = qualifiedPlayerIds(table, size);

  eq(`n=${n}: ${size} players qualify`, qualified.length, size);
  eq(`n=${n}: qualifiers are distinct`, new Set(qualified).size, size);
  check(
    `n=${n}: qualifiers are the top ${size} of the table`,
    qualified.every((id, i) => table[i].playerId === id),
  );

  const bracket = generateBracket(qualified);
  const firstRound = Object.values(bracket.matches).filter((m) => m.round === 0);
  const seats = firstRound.flatMap((m) => [m.seedAId!, m.seedBId!]);
  eq(`n=${n}: nobody is drawn twice`, new Set(seats).size, size);
  check(`n=${n}: only qualified players are drawn`, seats.every((id) => qualified.includes(id)));

  // The draw must not simply pair 1v2, 3v4 every time.
  const resolved = resolveBracket(bracket, byId);
  check(`n=${n}: bracket resolves ${resolved.length} ties`, resolved.length === (size >= 4 ? size : size - 1));
}

{
  // Ten separate draws of the same qualifiers should not all be identical.
  const ids = Array.from({ length: 8 }, (_, i) => "q" + i);
  const draws = new Set(
    Array.from({ length: 12 }, () => generateBracket(ids).participants.join(",")),
  );
  check("the knockout draw is shuffled, not seeded 1v2/3v4", draws.size > 1, `${draws.size} distinct draws`);
}

/* ------------------------------------------------------ 6. validation */

section("Validation");

eq("empty roster is rejected", validateRoster([]).ok, false);
eq("one player is rejected", validateRoster(["Solo"]).ok, false);
eq("two players are accepted", validateRoster(["Ahmad", "Yassin"]).ok, true);
eq("blank name is rejected", validateRoster(["Ahmad", "   "]).ok, false);
eq("duplicate name is rejected", validateRoster(["Ahmad", "Ahmad"]).ok, false);
eq(
  "duplicate name ignoring case and spacing is rejected",
  validateRoster(["Ahmad", "  ahmad "]).ok,
  false,
);
eq("101 players are rejected", validateRoster(makePlayers(101).map((p) => p.name)).ok, false);
eq("100 players are accepted", validateRoster(makePlayers(100).map((p) => p.name)).ok, true);
eq("names are trimmed", normalizeName("   Ahmad   Ali  "), "Ahmad Ali");
check(
  "trimmed names come back from validation",
  validateRoster(["  Ahmad ", "Yassin  "]).value?.join("|") === "Ahmad|Yassin",
);

eq("goals: 3 parses", parseGoals("3"), 3);
eq("goals: 0 parses", parseGoals("0"), 0);
eq("goals: empty is invalid", parseGoals(""), null);
eq("goals: negative is invalid", parseGoals("-1"), null);
eq("goals: decimal is invalid", parseGoals("1.5"), null);
eq("goals: text is invalid", parseGoals("two"), null);
eq("goals: 100 is out of range", parseGoals("100"), null);
eq("group draw is allowed", validateScore({ a: "2", b: "2" }, { allowDraw: true }).ok, true);
eq("knockout draw is rejected", validateScore({ a: "2", b: "2" }, { allowDraw: false }).ok, false);
eq("knockout decisive score is accepted", validateScore({ a: "3", b: "2" }, { allowDraw: false }).ok, true);

/* ------------------------------------------------------------ summary */

console.log("");
if (failed === 0) {
  console.log(`\x1b[32m✓ all ${passed} checks passed\x1b[0m`);
} else {
  console.log(`\x1b[31m✗ ${failed} of ${passed + failed} checks failed\x1b[0m`);
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
