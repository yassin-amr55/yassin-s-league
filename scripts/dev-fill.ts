/**
 * Dev helper: fills in results for the league currently in the emulator.
 *
 *   npx tsx scripts/dev-fill.ts group     score every unplayed group fixture
 *   npx tsx scripts/dev-fill.ts knockout  play the bracket to a champion
 *   npx tsx scripts/dev-fill.ts semis     play the bracket up to the final only
 *
 * Used to exercise the UI without clicking through hundreds of fixtures.
 * Not part of the app - it only ever calls the same functions the admin UI does.
 */
process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||= "demo-api-key";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||= "demo-yassins-league.firebaseapp.com";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||= "demo-yassins-league";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||= "1:000000000000:web:demo";
process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";

import type { Unsubscribe } from "firebase/firestore";
import type { BracketDoc, Match, Player } from "../src/lib/types";

async function main() {
  const mode = process.argv[2] ?? "group";
  const db = await import("../src/lib/db");
  const { resolveBracket, staleResultIds } = await import("../src/lib/bracket");
  const { isMatchCompleted } = await import("../src/lib/schedule");

  const live = {
    players: [] as Player[],
    matches: [] as Match[],
    bracket: null as BracketDoc | null,
    revision: 0,
  };
  const bump = () => void live.revision++;
  const noop = () => {};
  const unsubs: Unsubscribe[] = [
    db.subscribePlayers((p) => ((live.players = p), bump()), noop),
    db.subscribeMatches((m) => ((live.matches = m), bump()), noop),
    db.subscribeBracket((b) => ((live.bracket = b), bump()), noop),
  ];

  await new Promise((r) => setTimeout(r, 1200));

  if (mode === "group") {
    const pending = live.matches.filter((m) => !isMatchCompleted(m));
    console.log(`Scoring ${pending.length} unplayed fixtures...`);
    for (let i = 0; i < pending.length; i += 40) {
      await Promise.all(
        pending
          .slice(i, i + 40)
          .map((m) => db.saveGroupResult(m, (m.index * 5) % 7, (m.index * 2) % 4)),
      );
    }
    console.log("Done.");
  } else {
    const byId = new Map(live.players.map((p) => [p.id, p]));
    const stopBeforeFinal = mode === "semis";
    let played = 0;
    for (;;) {
      const resolved = resolveBracket(live.bracket!, byId);
      const finalRound = Math.log2(live.bracket!.size) - 1;
      const next = resolved.find(
        (m) =>
          !m.completed &&
          m.playerAId &&
          m.playerBId &&
          !(stopBeforeFinal && (m.round === finalRound || m.isThirdPlace)),
      );
      if (!next) break;
      const result = {
        aId: next.playerAId!,
        bId: next.playerBId!,
        aGoals: next.matchNumber % 2 === 0 ? 2 : 0,
        bGoals: next.matchNumber % 2 === 0 ? 0 : 2,
      };
      const candidate: BracketDoc = {
        ...live.bracket!,
        matches: { ...live.bracket!.matches, [next.id]: { ...live.bracket!.matches[next.id], result } },
      };
      const rev = live.revision;
      await db.saveBracketResult(next.id, result, staleResultIds(resolveBracket(candidate, byId)));
      while (live.revision === rev) await new Promise((r) => setTimeout(r, 40));
      played++;
    }
    console.log(`Played ${played} knockout ties.`);
  }

  for (const u of unsubs) u();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
