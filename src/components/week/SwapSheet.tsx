"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dayLabel, type Day, type Meal } from "@/lib/week";
import { swapSlot, applySwap } from "@/app/week/[start]/ai-actions";
import type { Swaps } from "@/lib/ai/validate";

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]";

export function SwapSheet({
  start,
  day,
  meal,
  label = "swap",
  className,
}: {
  start: string;
  day: Day;
  meal: Meal;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [swaps, setSwaps] = useState<Swaps | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startT] = useTransition();
  const router = useRouter();

  const fetchSwaps = (why?: string) => {
    setError(null);
    startT(async () => {
      const res = await swapSlot(start, day, meal, why);
      if (res.ok) setSwaps(res.swaps);
      else setError(res.error);
    });
  };

  const openSheet = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
    setSwaps(null);
    setReason("");
    fetchSwaps();
  };

  const pick = (recipeId: string, multiplier: number) => {
    startT(async () => {
      await applySwap(start, day, meal, recipeId, multiplier);
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <button
        onClick={openSheet}
        className={className ?? "rounded-md border border-[var(--rule)] px-2 py-0.5 text-[11px] text-[var(--ink2)] hover:border-[var(--ink2)] hover:text-[var(--ink)]"}
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(18,26,22,0.42)] p-0 backdrop-blur-[1px] sm:items-center sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-[var(--rule)] bg-[var(--card)] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-[var(--rule)] bg-[var(--card)] px-4 py-3">
              <span className="font-display text-base capitalize">Swap {dayLabel(day)} {meal}</span>
              <button onClick={() => setOpen(false)} className="rounded-lg border border-[var(--rule)] px-2 py-1 text-sm hover:bg-[var(--rule2)]">Close</button>
            </div>

            <div className="p-4">
              {error && <p className="text-sm text-[var(--clay-bg)]">{error}</p>}

              {!swaps && !error && (
                <p className="py-6 text-center text-sm text-[var(--ink2)]">Finding alternatives…</p>
              )}

              {swaps && (
                <>
                  {swaps.coverageNote && (
                    <p className="mb-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--amber)", color: "var(--amber-text)" }}>
                      {swaps.coverageNote}
                    </p>
                  )}
                  <ul className="flex flex-col gap-2">
                    {swaps.options.map((o) => (
                      <li key={o.recipeId}>
                        <button
                          onClick={() => pick(o.recipeId, o.multiplier)}
                          disabled={pending}
                          className="w-full rounded-lg border border-[var(--rule)] px-3 py-2 text-left hover:border-[var(--ink2)] disabled:opacity-50"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium">{o.title}</span>
                            {o.multiplier > 1 && <span className="font-mono text-[11px] text-[var(--ink2)]">×{o.multiplier}</span>}
                          </div>
                          {o.rationale && <div className="text-xs text-[var(--ink2)]">{o.rationale}</div>}
                        </button>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3">
                    <div className={`${EYEBROW} mb-1`}>Not quite? Say why and ask again</div>
                    <div className="flex gap-2">
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && fetchSwaps(reason)}
                        placeholder="too heavy, had chicken twice…"
                        className="min-w-0 flex-1 rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-sm"
                      />
                      <button
                        onClick={() => fetchSwaps(reason)}
                        disabled={pending}
                        className="shrink-0 rounded-lg border border-[var(--rule)] px-3 py-2 text-sm hover:bg-[var(--rule2)] disabled:opacity-50"
                      >
                        {pending ? "…" : "Ask again"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
