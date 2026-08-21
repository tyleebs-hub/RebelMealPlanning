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
      className={`inline-flex items-center rounded-lg border border-[var(--rule)] bg-[var(--card)] ${pending ? "opacity-50" : ""}`}
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
      <span className="min-w-9 text-center font-mono text-sm font-medium tabular-nums">×{value}</span>
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
