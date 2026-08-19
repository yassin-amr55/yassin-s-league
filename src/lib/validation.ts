import { MAX_PLAYERS, MIN_PLAYERS } from "./bracket";

export interface ValidationResult<T> {
  ok: boolean;
  error?: string;
  value?: T;
}

/** Collapses inner whitespace and trims - "  Ali   Ahmad " -> "Ali Ahmad". */
export function normalizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/** Case-insensitive key used to detect duplicates. */
export function nameKey(name: string): string {
  return normalizeName(name).toLocaleLowerCase();
}

/**
 * Validates the whole roster at once so the admin gets one clear message
 * instead of a field-by-field drip.
 */
export function validateRoster(rawNames: readonly string[]): ValidationResult<string[]> {
  const names = rawNames.map(normalizeName);

  if (names.length === 0) {
    return { ok: false, error: "No players added. Add at least 2 players to start." };
  }
  if (names.some((n) => n.length === 0)) {
    return { ok: false, error: "Player names cannot be empty." };
  }
  if (names.length < MIN_PLAYERS) {
    return { ok: false, error: `You need at least ${MIN_PLAYERS} players.` };
  }
  if (names.length > MAX_PLAYERS) {
    return { ok: false, error: `Maximum ${MAX_PLAYERS} players.` };
  }

  const seen = new Set<string>();
  for (const name of names) {
    const key = nameKey(name);
    if (seen.has(key)) {
      return { ok: false, error: `Duplicate player name: "${name}".` };
    }
    seen.add(key);
  }

  const tooLong = names.find((n) => n.length > 32);
  if (tooLong) {
    return { ok: false, error: "Player names must be 32 characters or fewer." };
  }

  return { ok: true, value: names };
}

/** Goals must be a whole number between 0 and 99. */
export function parseGoals(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0 || value > 99) return null;
  return value;
}

export interface ScoreInput {
  a: string;
  b: string;
}

export function validateScore(
  input: ScoreInput,
  options: { allowDraw: boolean },
): ValidationResult<{ a: number; b: number }> {
  const a = parseGoals(input.a);
  const b = parseGoals(input.b);
  if (a === null || b === null) {
    return { ok: false, error: "Please enter valid goal numbers (whole numbers, 0 or more)." };
  }
  if (!options.allowDraw && a === b) {
    return {
      ok: false,
      error:
        "Knockout matches cannot finish tied. Enter the final score after extra time or penalties.",
    };
  }
  return { ok: true, value: { a, b } };
}
