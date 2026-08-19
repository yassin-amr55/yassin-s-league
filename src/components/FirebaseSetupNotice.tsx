"use client";

import { Database } from "lucide-react";
import { Card } from "@/components/ui";

/**
 * Shown instead of a crash when the Firebase environment variables are missing,
 * so a fresh deploy explains itself rather than throwing.
 */
export function FirebaseSetupNotice({ missing }: { missing: string[] }) {
  return (
    <Card className="mx-auto max-w-2xl p-6">
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-royal-500/20 ring-1 ring-inset ring-royal-400/30">
          <Database className="h-5 w-5 text-royal-300" aria-hidden />
        </span>
        <div className="min-w-0 space-y-3">
          <div>
            <h2 className="title-display text-lg text-white">Firebase is not configured</h2>
            <p className="mt-1 text-sm text-royal-200/80">
              The app needs your Cloud Firestore credentials before it can store a
              league. Add these environment variables and restart (or redeploy):
            </p>
          </div>

          <ul className="space-y-1 rounded-xl border border-white/10 bg-navy-950/50 p-3 font-mono text-xs text-royal-200">
            {missing.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>

          <p className="text-sm text-royal-200/70">
            The full step-by-step setup is in <span className="font-semibold text-white">README.md</span>.
            Locally the values go in <code className="rounded bg-white/10 px-1">.env.local</code>; on
            Vercel they go in Project Settings &rarr; Environment Variables.
          </p>
        </div>
      </div>
    </Card>
  );
}
