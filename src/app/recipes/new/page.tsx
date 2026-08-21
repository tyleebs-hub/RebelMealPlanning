"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createRecipe, fetchRecipeFromUrl } from "./actions";
import type { MealType } from "@/lib/types";

const MEAL_TYPES: MealType[] = [
  "breakfast", "lunch", "dinner", "snack", "drink", "dessert", "side",
];

const FLAGS: { name: string; label: string }[] = [
  { name: "reheats_well", label: "Reheats well (lunch candidate)" },
  { name: "scales_cheaply", label: "Scales cheaply" },
  { name: "kids_like", label: "Kids like" },
  { name: "is_component", label: "Component batch" },
];

export default function NewRecipePage() {
  const [url, setUrl] = useState("");
  const [fetching, startFetch] = useTransition();
  const [fetchMsg, setFetchMsg] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [mealTypes, setMealTypes] = useState<Set<MealType>>(new Set());
  const [activeMin, setActiveMin] = useState("");
  const [totalMin, setTotalMin] = useState("");
  const [servings, setServings] = useState("4");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [steps, setSteps] = useState("");

  const doFetch = () => {
    setFetchMsg(null);
    startFetch(async () => {
      const r = await fetchRecipeFromUrl(url);
      if (!r.ok) {
        setFetchMsg(r.error);
        return;
      }
      const rec = r.recipe;
      setTitle(rec.title);
      setActiveMin(rec.activeMin != null ? String(rec.activeMin) : "");
      setTotalMin(rec.totalMin != null ? String(rec.totalMin) : "");
      setServings(String(rec.servings));
      setSourceName(rec.sourceName ?? "");
      setSourceUrl(rec.sourceUrl);
      setIngredients(rec.ingredients.join("\n"));
      setSteps(rec.steps.join("\n"));
      setFetchMsg(`Prefilled from the page — ${rec.ingredients.length} ingredients, ${rec.steps.length} steps. Review and save.`);
    });
  };

  const toggleMeal = (t: MealType) =>
    setMealTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const input =
    "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950";

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <Link href="/recipes" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200">
        ← Recipes
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">Add a recipe</h1>

      {/* Import from URL */}
      <div className="mt-4 rounded-xl border border-dashed border-neutral-300 p-3 dark:border-neutral-700">
        <label className="text-sm font-medium">Import from a URL</label>
        <div className="mt-2 flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className={`${input} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={doFetch}
            disabled={fetching || !url}
            className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {fetching ? "Fetching…" : "Fetch"}
          </button>
        </div>
        {fetchMsg && <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{fetchMsg}</p>}
      </div>

      {/* The form */}
      <form action={createRecipe} className="mt-6 flex flex-col gap-4">
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
              <input type="checkbox" name={f.name} defaultChecked={f.name === "scales_cheaply"} />
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
          <textarea name="notes" rows={2} className={input} />
        </label>

        <button type="submit" className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
          Save recipe
        </button>
      </form>
    </main>
  );
}
