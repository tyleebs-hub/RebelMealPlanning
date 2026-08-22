"use client";

import { useState, useTransition } from "react";
import { fetchRecipeFromUrl } from "@/app/recipes/new/actions";
import type { MealType } from "@/lib/types";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack", "drink", "dessert", "side"];
const FLAGS: { name: keyof RecipeFormInitial["flags"]; label: string }[] = [
  { name: "reheats_well", label: "Reheats well (lunch candidate)" },
  { name: "scales_cheaply", label: "Scales cheaply" },
  { name: "kids_like", label: "Kids like" },
  { name: "is_component", label: "Component batch" },
];

export type RecipeFormInitial = {
  title: string;
  mealTypes: string[];
  activeMin: string;
  totalMin: string;
  servings: string;
  sourceName: string;
  sourceUrl: string;
  ingredients: string;
  steps: string;
  notes: string;
  flags: { reheats_well: boolean; scales_cheaply: boolean; kids_like: boolean; is_component: boolean };
};

export const EMPTY_RECIPE: RecipeFormInitial = {
  title: "", mealTypes: [], activeMin: "", totalMin: "", servings: "4",
  sourceName: "", sourceUrl: "", ingredients: "", steps: "", notes: "",
  flags: { reheats_well: false, scales_cheaply: true, kids_like: false, is_component: false },
};

const input =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950";

export function RecipeForm({
  action,
  initial,
  showImport = false,
  submitLabel,
  recipeId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  initial: RecipeFormInitial;
  showImport?: boolean;
  submitLabel: string;
  recipeId?: string;
}) {
  const [url, setUrl] = useState("");
  const [fetching, startFetch] = useTransition();
  const [fetchMsg, setFetchMsg] = useState<string | null>(null);

  const [title, setTitle] = useState(initial.title);
  const [mealTypes, setMealTypes] = useState<Set<string>>(new Set(initial.mealTypes));
  const [activeMin, setActiveMin] = useState(initial.activeMin);
  const [totalMin, setTotalMin] = useState(initial.totalMin);
  const [servings, setServings] = useState(initial.servings);
  const [sourceName, setSourceName] = useState(initial.sourceName);
  const [sourceUrl, setSourceUrl] = useState(initial.sourceUrl);
  const [ingredients, setIngredients] = useState(initial.ingredients);
  const [steps, setSteps] = useState(initial.steps);

  const doFetch = () => {
    setFetchMsg(null);
    startFetch(async () => {
      const r = await fetchRecipeFromUrl(url);
      if (!r.ok) return setFetchMsg(r.error);
      const rec = r.recipe;
      setTitle(rec.title);
      setActiveMin(rec.activeMin != null ? String(rec.activeMin) : "");
      setTotalMin(rec.totalMin != null ? String(rec.totalMin) : "");
      setServings(String(rec.servings));
      setSourceName(rec.sourceName ?? "");
      setSourceUrl(rec.sourceUrl);
      setIngredients(rec.ingredients.join("\n"));
      setSteps(rec.steps.join("\n"));
      setFetchMsg(`Prefilled — ${rec.ingredients.length} ingredients, ${rec.steps.length} steps. Review and save.`);
    });
  };

  const toggleMeal = (t: string) =>
    setMealTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  return (
    <>
      {showImport && (
        <div className="mt-4 rounded-xl border border-dashed border-neutral-300 p-3 dark:border-neutral-700">
          <label className="text-sm font-medium">Import from a URL</label>
          <div className="mt-2 flex gap-2">
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={`${input} min-w-0 flex-1`} />
            <button type="button" onClick={doFetch} disabled={fetching || !url} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
              {fetching ? "Fetching…" : "Fetch"}
            </button>
          </div>
          {fetchMsg && <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{fetchMsg}</p>}
        </div>
      )}

      <form action={action} className="mt-6 flex flex-col gap-4">
        {recipeId && <input type="hidden" name="id" value={recipeId} />}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Title</span>
          <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
        </label>

        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Meal types</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {MEAL_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-1.5 capitalize">
                <input type="checkbox" name="meal_types" value={t} checked={mealTypes.has(t)} onChange={() => toggleMeal(t)} />
                {t}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Active min</span>
            <input name="active_min" inputMode="numeric" value={activeMin} onChange={(e) => setActiveMin(e.target.value)} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Total min</span>
            <input name="total_min" inputMode="numeric" value={totalMin} onChange={(e) => setTotalMin(e.target.value)} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Servings</span>
            <input name="base_servings" inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} className={input} />
          </label>
        </div>

        <div className="flex flex-col gap-1.5 text-sm">
          {FLAGS.map((f) => (
            <label key={f.name} className="flex items-center gap-2">
              <input type="checkbox" name={f.name} defaultChecked={initial.flags[f.name]} />
              {f.label}
            </label>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Ingredients <span className="font-normal text-neutral-400">(one per line)</span></span>
          <textarea name="ingredients" rows={8} value={ingredients} onChange={(e) => setIngredients(e.target.value)} className={`${input} font-mono`} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Steps <span className="font-normal text-neutral-400">(one per line)</span></span>
          <textarea name="steps" rows={8} value={steps} onChange={(e) => setSteps(e.target.value)} className={input} />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Source name</span>
            <input name="source_name" value={sourceName} onChange={(e) => setSourceName(e.target.value)} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Source URL</span>
            <input name="source_url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} className={input} />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Notes</span>
          <textarea name="notes" rows={2} defaultValue={initial.notes} className={input} />
        </label>

        <button type="submit" className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
          {submitLabel}
        </button>
      </form>
    </>
  );
}
