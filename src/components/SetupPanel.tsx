"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { Button, Card, ErrorBanner, InfoNote, SectionTitle } from "@/components/ui";
import { bracketSizeFor, isDirectKnockoutCount, MAX_PLAYERS, MIN_PLAYERS } from "@/lib/bracket";
import { expectedFixtureCount } from "@/lib/schedule";
import { normalizeName, validateRoster } from "@/lib/validation";
import { saveDraftPlayers, startLeague } from "@/lib/db";
import { friendlyFirestoreError } from "@/lib/firebase";

const DRAFT_SAVE_DELAY = 700;

/**
 * Setup screen: build the roster, then start the league.
 *
 * The roster is mirrored into Firestore on a debounce so a refresh mid-setup
 * does not lose the names, but the local list stays the source of truth while
 * the admin is typing.
 */
export function SetupPanel({ initialNames }: { initialNames: string[] }) {
  const [names, setNames] = useState<string[]>(
    initialNames.length > 0 ? initialNames : ["", ""],
  );
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const skipNextSave = useRef(true);

  // Persist the draft roster so a refresh during setup keeps the names.
  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const handle = window.setTimeout(() => {
      saveDraftPlayers(names.map((n) => n.slice(0, 40))).catch((err) => {
        console.error("[Yassin's League] save draft roster", err);
      });
    }, DRAFT_SAVE_DELAY);
    return () => window.clearTimeout(handle);
  }, [names]);

  const filled = names.map(normalizeName).filter((n) => n.length > 0);
  const count = filled.length;
  const directKnockout = isDirectKnockoutCount(count);
  const plannedSize = bracketSizeFor(count);

  function addPlayer() {
    setError(null);
    if (names.length >= MAX_PLAYERS) {
      setError(`Maximum ${MAX_PLAYERS} players.`);
      return;
    }
    setNames((prev) => [...prev, ""]);
    // Keep the newest input in view once it has rendered. Each input sits in its
    // own wrapper, so ":last-of-type" would match the *first* one - take the
    // last of the full list instead.
    window.setTimeout(() => {
      const list = listRef.current;
      if (!list) return;
      list.scrollTop = list.scrollHeight;
      const inputs = list.querySelectorAll<HTMLInputElement>("input");
      inputs[inputs.length - 1]?.focus();
    }, 20);
  }

  function removePlayer(index: number) {
    setError(null);
    setNames((prev) => prev.filter((_, i) => i !== index));
  }

  function updateName(index: number, value: string) {
    setError(null);
    setNames((prev) => prev.map((n, i) => (i === index ? value : n)));
  }

  async function start() {
    if (starting) return;
    const check = validateRoster(names);
    if (!check.ok || !check.value) {
      setError(check.error ?? "Please check the player list.");
      return;
    }

    setStarting(true);
    setError(null);
    try {
      await startLeague(check.value, isDirectKnockoutCount(check.value.length) ? "KNOCKOUT" : "GROUP");
    } catch (err) {
      console.error("[Yassin's League] start league", err);
      setError(friendlyFirestoreError(err, "Could not start the league. Please try again."));
      setStarting(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle hint="Add every player, then start the league.">Add Players</SectionTitle>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <span className="flex items-center gap-2 text-sm text-royal-200">
            <Users className="h-4 w-4" aria-hidden />
            <span className="tabular-nums">
              {count} {count === 1 ? "player" : "players"}
            </span>
            <span className="text-white/30">/</span>
            <span className="tabular-nums text-white/40">{MAX_PLAYERS} max</span>
          </span>
          <Button size="sm" onClick={addPlayer} disabled={names.length >= MAX_PLAYERS}>
            <Plus className="h-4 w-4" aria-hidden />
            Add Player
          </Button>
        </div>

        <div ref={listRef} className="scroll-y max-h-[26rem] space-y-2 p-4">
          {names.map((name, index) => (
            <div key={index} className="flex items-center gap-3">
              <label
                htmlFor={`player-${index}`}
                className="w-20 shrink-0 text-xs uppercase tracking-wider text-white/40"
              >
                Player {index + 1}
              </label>
              <input
                id={`player-${index}`}
                value={name}
                maxLength={40}
                onChange={(e) => updateName(index, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (index === names.length - 1) addPlayer();
                  }
                }}
                placeholder={`Name of player ${index + 1}`}
                className="h-10 min-w-0 flex-1 rounded-lg border border-white/12 bg-navy-950/60 px-3 text-sm text-white placeholder:text-white/20 focus:border-royal-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => removePlayer(index)}
                aria-label={`Remove player ${index + 1}`}
                className="rounded-lg p-2 text-white/35 transition-colors hover:bg-red-500/15 hover:text-red-300"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}

          {names.length === 0 && (
            <p className="py-8 text-center text-sm text-white/40">
              No players added. Use &ldquo;Add Player&rdquo; to begin.
            </p>
          )}
        </div>
      </Card>

      {count >= MIN_PLAYERS && (
        <InfoNote>
          {directKnockout ? (
            <>
              <strong>{count} players</strong> is an exact bracket size - the league
              goes straight to a {count}-player knockout bracket, with no group stage.
            </>
          ) : (
            <>
              <strong>{count} players</strong> will play a full round-robin group stage of{" "}
              <strong>{expectedFixtureCount(count)} fixtures</strong>. The top{" "}
              <strong>{plannedSize}</strong> then go through to the knockout bracket.
            </>
          )}
        </InfoNote>
      )}

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="flex justify-end">
        <Button size="lg" onClick={start} loading={starting} disabled={count < MIN_PLAYERS}>
          START LEAGUE
        </Button>
      </div>
    </div>
  );
}
