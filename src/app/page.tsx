"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, KeyRound, ShieldCheck, Trophy } from "lucide-react";
import { Button, ErrorBanner, Modal } from "@/components/ui";
import { checkAdminPassword, grantAdminSession } from "@/lib/session";

export default function LandingPage() {
  const router = useRouter();
  const [askPassword, setAskPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!checkAdminPassword(password)) {
      setError("Incorrect password. Please try again.");
      return;
    }
    setBusy(true);
    grantAdminSession();
    router.push("/admin");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-14">
      <div className="rise-in w-full max-w-xl text-center">
        <div className="mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-gradient-to-b from-royal-500/30 to-violet-glow/20 shadow-xl shadow-royal-500/20">
          <Trophy className="h-8 w-8 text-royal-300" aria-hidden />
        </div>

        <p className="eyebrow text-[11px] font-semibold text-royal-300/80">
          Tournament Manager
        </p>
        <h1 className="title-display mt-3 text-5xl leading-[0.95] text-white sm:text-7xl">
          YASSIN&rsquo;S
          <span className="block bg-gradient-to-r from-royal-300 via-white to-royal-300 bg-clip-text text-transparent">
            LEAGUE
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-royal-200/70 sm:text-base">
          Round-robin standings, a full fixture list and a knockout bracket -
          for one league at a time.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            size="lg"
            onClick={() => {
              setError(null);
              setPassword("");
              setAskPassword(true);
            }}
            className="w-full sm:w-52"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden />
            LOGIN AS ADMIN
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => router.push("/view")}
            className="w-full sm:w-52"
          >
            <Eye className="h-4 w-4" aria-hidden />
            LOGIN AS PLAYER
          </Button>
        </div>

        <p className="mt-6 text-xs text-white/35">
          Player access is read-only and needs no password.
        </p>
      </div>

      <Modal
        open={askPassword}
        onClose={() => setAskPassword(false)}
        title="Admin access"
      >
        <form onSubmit={submitPassword} className="space-y-4">
          <div>
            <label
              htmlFor="admin-password"
              className="mb-1.5 block text-sm font-medium text-royal-200"
            >
              Admin password
            </label>
            <div className="relative">
              <KeyRound
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30"
                aria-hidden
              />
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                className="h-11 w-full rounded-lg border border-white/15 bg-navy-950/60 pl-9 pr-3 text-white placeholder:text-white/25 focus:border-royal-400 focus:outline-none"
                placeholder="Enter password"
              />
            </div>
          </div>

          {error && <ErrorBanner message={error} />}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAskPassword(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Enter
            </Button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
