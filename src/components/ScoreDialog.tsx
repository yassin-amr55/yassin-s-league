"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, ErrorBanner, Modal } from "@/components/ui";
import { validateScore } from "@/lib/validation";

export interface ScoreDialogTarget {
  key: string;
  title: string;
  subtitle: string;
  nameA: string;
  nameB: string;
  initialA: number | null;
  initialB: number | null;
  /** Group fixtures may end level; knockout ties may not. */
  allowDraw: boolean;
  /** Set when a previously entered score can be wiped. */
  canClear: boolean;
}

/**
 * The one score-entry surface, shared by group fixtures and knockout ties.
 * The admin only types the two goal totals - every table and every bracket
 * placement is recalculated from them.
 */
export function ScoreDialog({
  target,
  onClose,
  onSave,
  onClear,
}: {
  target: ScoreDialogTarget | null;
  onClose: () => void;
  onSave: (a: number, b: number) => Promise<void>;
  onClear?: () => Promise<void>;
}) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    setA(target?.initialA != null ? String(target.initialA) : "");
    setB(target?.initialB != null ? String(target.initialB) : "");
    setError(null);
    setSaving(false);
    setClearing(false);
  }, [target?.key, target?.initialA, target?.initialB]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!target || saving || clearing) return;

    const result = validateScore({ a, b }, { allowDraw: target.allowDraw });
    if (!result.ok || !result.value) {
      setError(result.error ?? "Please enter valid goal numbers.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(result.value.a, result.value.b);
      onClose();
    } catch (err) {
      console.error("[Yassin's League] save result", err);
      setError(err instanceof Error ? err.message : "Could not save result. Please try again.");
      setSaving(false);
    }
  }

  async function clear() {
    if (!onClear || saving || clearing) return;
    setClearing(true);
    setError(null);
    try {
      await onClear();
      onClose();
    } catch (err) {
      console.error("[Yassin's League] clear result", err);
      setError("Could not clear this result. Please try again.");
      setClearing(false);
    }
  }

  return (
    <Modal open={!!target} onClose={onClose} title={target?.title ?? "Enter result"}>
      {target && (
        <form onSubmit={submit} className="space-y-5">
          <p className="-mt-2 text-xs uppercase tracking-wider text-royal-300/70">
            {target.subtitle}
          </p>

          <div className="space-y-3">
            <GoalRow
              id="score-a"
              name={target.nameA}
              value={a}
              onChange={(v) => {
                setA(v);
                setError(null);
              }}
            />
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
                vs
              </span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <GoalRow
              id="score-b"
              name={target.nameB}
              value={b}
              onChange={(v) => {
                setB(v);
                setError(null);
              }}
            />
          </div>

          {!target.allowDraw && (
            <p className="text-xs text-royal-300/70">
              Knockout ties cannot finish level - enter the score after extra time or
              penalties.
            </p>
          )}

          {error && <ErrorBanner message={error} />}

          <div className="flex items-center justify-between gap-2 pt-1">
            {target.canClear && onClear ? (
              <Button type="button" variant="ghost" onClick={clear} loading={clearing}>
                Clear result
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                SAVE RESULT
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

function GoalRow({
  id,
  name,
  value,
  onChange,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <label htmlFor={id} className="min-w-0 flex-1 truncate font-semibold text-white">
        {name}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={99}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Goals for ${name}`}
        className="h-11 w-20 rounded-lg border border-white/15 bg-navy-950/70 text-center text-lg font-bold tabular-nums text-white focus:border-royal-400 focus:outline-none"
        placeholder="0"
      />
    </div>
  );
}
