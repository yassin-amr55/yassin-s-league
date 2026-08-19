import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Only the project id and api key are strictly needed for Firestore, but a
 * missing value almost always means the environment was never configured, so we
 * check the whole set and surface one friendly message instead of a crash.
 */
export const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

export function missingFirebaseEnv(): string[] {
  const values: Record<string, string | undefined> = {
    NEXT_PUBLIC_FIREBASE_API_KEY: firebaseConfig.apiKey,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
    NEXT_PUBLIC_FIREBASE_APP_ID: firebaseConfig.appId,
  };
  return REQUIRED_ENV_VARS.filter((key) => !values[key]);
}

export function isFirebaseConfigured(): boolean {
  return missingFirebaseEnv().length === 0;
}

let cachedDb: Firestore | null = null;

function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
  return initializeApp({
    apiKey: firebaseConfig.apiKey!,
    authDomain: firebaseConfig.authDomain!,
    projectId: firebaseConfig.projectId!,
    storageBucket: firebaseConfig.storageBucket,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId!,
  });
}

/**
 * Lazily created Firestore handle. Nothing touches Firebase at import time, so
 * the app renders (and builds) fine before the environment is filled in.
 *
 * No Firebase Authentication is used anywhere in this project.
 */
export function getDb(): Firestore {
  if (cachedDb) return cachedDb;
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase is not configured. Missing: " + missingFirebaseEnv().join(", "),
    );
  }
  const db = getFirestore(getFirebaseApp());

  const emulator = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST;
  if (emulator) {
    const [host, port] = emulator.split(":");
    connectFirestoreEmulator(db, host, Number(port));
  }

  cachedDb = db;
  return db;
}

/** Turns a Firestore/network failure into something worth showing a human. */
export function friendlyFirestoreError(error: unknown, fallback: string): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  switch (code) {
    case "permission-denied":
      return "The database rejected this change. Check your Firestore security rules.";
    case "unavailable":
    case "deadline-exceeded":
      return "Could not reach the database. Check your connection and try again.";
    case "not-found":
      return "That data no longer exists. Refresh the page and try again.";
    case "failed-precondition":
      return "The database is not ready yet. Make sure Cloud Firestore is enabled for this project.";
    default:
      return fallback;
  }
}
