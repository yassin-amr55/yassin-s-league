"use client";

/**
 * Deliberately minimal gate: one shared password held in the browser session.
 *
 * This keeps friends out of each other's controls. It is NOT database security -
 * Firestore has no authentication in this project, so anyone who can reach the
 * database can write to it regardless of this check. See the README.
 */
export const ADMIN_PASSWORD =
  process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "jtyasin11m";

const SESSION_KEY = "yassins-league:admin";

export function checkAdminPassword(input: string): boolean {
  return input === ADMIN_PASSWORD;
}

export function grantAdminSession(): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // Private-mode browsers can refuse storage; the in-memory route still works.
  }
}

export function clearAdminSession(): void {
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function hasAdminSession(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}
