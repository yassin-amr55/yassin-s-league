const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Short collision-resistant id. Firestore auto-ids are only available when a
 * document is created, and matches live *inside* matchday documents, so we mint
 * our own.
 */
export function createId(prefix = ""): string {
  let out = "";
  const bytes =
    typeof crypto !== "undefined" && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint8Array(12))
      : Array.from({ length: 12 }, () => Math.floor(Math.random() * 256));
  for (let i = 0; i < 12; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return prefix + out;
}

/** Fisher-Yates. Returns a new array; the input is untouched. */
export function shuffle<T>(input: readonly T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
