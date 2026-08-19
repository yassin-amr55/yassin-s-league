"use client";

import { useRouter } from "next/navigation";
import { Home } from "lucide-react";
import { AppHeader, PageWrap } from "@/components/LeagueShell";
import { NotStartedYet, TournamentBoard } from "@/components/TournamentBoard";
import { FirebaseSetupNotice } from "@/components/FirebaseSetupNotice";
import { Button, ErrorBanner, Spinner } from "@/components/ui";
import { useLeague } from "@/hooks/useLeague";

/**
 * Player view. Strictly read-only: no write helper is imported here and every
 * child is rendered with `readOnly`, so no control that changes data is
 * reachable from this route.
 */
export default function PlayerViewPage() {
  const router = useRouter();
  const { view, loading, error, configured, missingEnv } = useLeague();

  return (
    <main className="min-h-dvh">
      <AppHeader
        role="Player"
        status={view.status}
        actions={
          <Button size="sm" variant="secondary" onClick={() => router.push("/")}>
            <Home className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Home</span>
          </Button>
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
          <NotStartedYet readOnly />
        ) : (
          <TournamentBoard view={view} readOnly />
        )}
      </PageWrap>
    </main>
  );
}
