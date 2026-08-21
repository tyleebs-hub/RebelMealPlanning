"use client";

import { useMemo, useState } from "react";
import { addCookEvent } from "@/app/week/[start]/actions";
import { DAYS, dayLabel } from "@/lib/week";
import type { MealType } from "@/lib/types";

type PickRecipe = {
  id: string;
  title: string;
  meal_types: MealType[];
  is_component: boolean;
};

export function AddCookForm({ start, recipes }: { start: string; recipes: PickRecipe[] }) {
  const [kind, setKind] = useState<"dinner" | "prep">("dinner");

  // Dinner picker → dinner-tagged or untagged. Prep → components first, then rest.
  const filtered = useMemo(() => {
    if (kind === "dinner") {
      return recipes.filter(
        (r) => r.meal_types.length === 0 || r.meal_types.includes("dinner"),
      );
    }
    return [...recipes].sort((a, b) => Number(b.is_component) - Number(a.is_component));
  }, [kind, recipes]);

  return (
    <form
      action={addCookEvent}
      className="mt-3 flex flex-col gap-2 rounded-xl border border-dashed border-neutral-300 p-3 dark:border-neutral-700"
    >
      <input type="hidden" name="start" value={start} />
      <div className="flex gap-2 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="kind"
            value="dinner"
            checked={kind === "dinner"}
            onChange={() => setKind("dinner")}
          />
          Dinner
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="kind"
            value="prep"
            checked={kind === "prep"}
            onChange={() => setKind("prep")}
          />
          Prep / component
        </label>
      </div>

      <select
        name="recipeId"
        required
        className="rounded-lg border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        defaultValue=""
      >
        <option value="" disabled>
          Pick a recipe…
        </option>
        {filtered.map((r) => (
          <option key={r.id} value={r.id}>
            {r.title}
            {r.meal_types.length === 0 ? " (needs a label)" : ""}
            {r.is_component ? " · component" : ""}
          </option>
        ))}
      </select>

      <div className="flex gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-neutral-500">×</span>
          <input
            type="number"
            name="multiplier"
            min={1}
            max={8}
            defaultValue={1}
            className="w-16 rounded-lg border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
        </label>
        <select
          name="day"
          defaultValue=""
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        >
          <option value="">No day</option>
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {dayLabel(d)}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        Add cook
      </button>
    </form>
  );
}
