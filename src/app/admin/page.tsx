"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, RotateCcw } from "lucide-react";
import { AppHeader, PageWrap } from "@/components/LeagueShell";
import { SetupPanel } from "@/components/SetupPanel";
import { TournamentBoard } from "@/components/TournamentBoard";
import { FirebaseSetupNotice } from "@/components/FirebaseSetupNotice";
import { Button, Card, ErrorBanner, Modal, Spinner } from "@/components/ui";
import { useLeague } from "@/hooks/useLeague";
import { resetLeague } from "@/lib/db";
import { friendlyFirestoreError } from "@/lib/firebase";
import {
  checkAdminPassword,
  clearAdminSession,
  grantAdminSession,
  hasAdminSession,
} from "@/lib/session";

export default function AdminPage() {
  const router = useRouter();
  // `null` while we have not yet checked - avoids a hydration mismatch.
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthed(hasAdminSession());
  }, []);

  if (authed === null) {
    return (
      <main className="min-h-dvh">
        <Spinner label="Checking access" />
      </main>
    );
  }

  if (!authed) {
    return <AdminGate onSuccess={() => setAuthed(true)} onCancel={() => router.push("/")} />;
  }

  return <AdminConsole onSignOut={() => {
    clearAdminSession();
    router.push("/");
  }} />;
}

function AdminGate({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!checkAdminPassword(password)) {
      setError("Incorrect password. Please try again.");
      return;
    }
    grantAdminSession();
    onSuccess();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <Card className="rise-in w-full max-w-sm p-6">
        <h1 className="title-display text-xl text-white">Admin access</h1>
        <p className="mt-1 text-sm text-royal-300/80">
          Enter the admin password to manage the league.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="relative">
            <KeyRound
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30"
              aria-hidden
            />
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              aria-label="Admin password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder="Enter password"
              className="h-11 w-full rounded-lg border border-white/15 bg-navy-950/60 pl-9 pr-3 text-white placeholder:text-white/25 focus:border-royal-400 focus:outline-none"
            />
          </div>
          {error && <ErrorBanner message={error} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Back
            </Button>
            <Button type="submit">Enter</Button>
          </div>
        </form>
      </Card>
    </main>
  );
}

function AdminConsole({ onSignOut }: { onSignOut: () => void }) {
  const { view, loading, error, configured, missingEnv } = useLeague();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function doReset() {
    if (resetting) return;
    setResetting(true);
    setResetError(null);
    try {
      await resetLeague();
      setConfirmReset(false);
    } catch (err) {
      console.error("[Yassin's League] reset league", err);
      setResetError(friendlyFirestoreError(err, "Could not reset the league. Please try again."));
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="min-h-dvh">
      <AppHeader
        role="Admin"
        status={view.status}
        actions={
          <>
            {configured && view.tournament.status !== "SETUP" && (
              <Button size="sm" variant="danger" onClick={() => setConfirmReset(true)}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">RESET LEAGUE</span>
                <span className="sm:hidden">Reset</span>
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={onSignOut}>
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </>
        }
      />

      <PageWrap>
        {!configured ? (
          <FirebaseSetupNotice missing={missingEnv} />
        ) : error ? (
          <ErrorBanner message={error} />
        ) : loading ? (
          <Spinner label="Loading tournament" />
        ) : view.tournament.status === "SETUP" ? (
          <SetupPanel
            key={view.tournament.createdAt ?? "new"}
            initialNames={view.tournament.draftPlayers}
          />
        ) : (
          <TournamentBoard view={view} readOnly={false} />
        )}
      </PageWrap>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset league?">
        <div className="space-y-4">
          <p className="text-sm text-royal-200/85">
            Are you sure? This will delete the current league - every player, fixture,
            result and the bracket. This cannot be undone.
          </p>
          {resetError && <ErrorBanner message={resetError} />}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doReset} loading={resetting}>
              Delete and start over
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
