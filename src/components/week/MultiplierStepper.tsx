"use client";

import { useTransition } from "react";
import { setMultiplier } from "@/app/week/[start]/actions";

export function MultiplierStepper({
  start,
  cookEventId,
  value,
}: {
  start: string;
  cookEventId: string;
  value: number;
}) {
  const [pending, startTransition] = useTransition();

  const step = (delta: number) => {
    const next = Math.max(1, Math.min(8, value + delta));
    if (next === value) return;
    startTransition(() => setMultiplier(start, cookEventId, next));
  };

  return (
    <div
      className={`inline-flex items-center rounded-lg border border-neutral-300 dark:border-neutral-700 ${pending ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={pending || value <= 1}
        aria-label="Decrease multiplier"
        className="px-2.5 py-1 text-lg leading-none disabled:opacity-30"
      >
        −
      </button>
      <span className="min-w-9 text-center text-sm font-semibold tabular-nums">×{value}</span>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={pending || value >= 8}
        aria-label="Increase multiplier"
        className="px-2.5 py-1 text-lg leading-none disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}
