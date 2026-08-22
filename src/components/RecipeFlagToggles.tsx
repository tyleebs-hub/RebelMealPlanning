"use client";

import { useState, useTransition } from "react";
import { setRecipeFlag } from "@/app/recipes/[id]/actions";

type Flags = { reheats_well: boolean; kids_like: boolean; scales_cheaply: boolean };
type Field = keyof Flags;

const FLAGS: { field: Field; label: string; on: string }[] = [
  {
    field: "reheats_well",
    label: "Reheats well",
    on: "border-emerald-400/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  {
    field: "kids_like",
    label: "Kids like",
    on: "border-sky-400/60 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  },
  {
    field: "scales_cheaply",
    label: "Scales cheaply",
    on: "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  },
];

export function RecipeFlagToggles({ recipeId, initial }: { recipeId: string; initial: Flags }) {
  const [state, setState] = useState<Flags>(initial);
  const [, startT] = useTransition();

  const toggle = (field: Field) => {
    const next = !state[field];
    setState((s) => ({ ...s, [field]: next }));
    startT(() => setRecipeFlag(recipeId, field, next));
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {FLAGS.map((f) => {
        const active = state[f.field];
        return (
          <button
            key={f.field}
            type="button"
            onClick={() => toggle(f.field)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${
              active
                ? f.on
                : "border-dashed border-[var(--rule)] bg-transparent text-[var(--ink2)] hover:border-[var(--ink2)] hover:text-[var(--ink)]"
            }`}
          >
            <span aria-hidden>{active ? "✓" : "+"}</span>
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
