"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Recipe } from "@/lib/types";
import { MealTypeChips, RecipeBadges, TimeLine } from "@/components/recipe-meta";
import { publicImageUrl } from "@/lib/storage";
import { DishArt } from "@/components/DishArt";
import { hueForRecipe } from "@/lib/hues";
import { RecipeFilterBar } from "@/components/RecipeFilterBar";
import { QuickAddButton } from "@/components/week/QuickAdd";
import { EMPTY_FILTERS, matchesFilters, type RecipeFilters } from "@/lib/recipe-filter";

// Render a page at a time so a 2,000-recipe library doesn't mount thousands of
// image cards at once.
const PAGE_SIZE = 60;

export function RecipeLibraryGrid({ recipes }: { recipes: Recipe[] }) {
  const [filters, setFilters] = useState<RecipeFilters>(EMPTY_FILTERS);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const shown = useMemo(
    () => recipes.filter((r) => matchesFilters(r, filters)),
    [recipes, filters],
  );

  // Any change to the filter set starts the list back at the first page.
  useEffect(() => setLimit(PAGE_SIZE), [filters]);

  const visible = shown.slice(0, limit);

  return (
    <>
      <div className="mb-5">
        <RecipeFilterBar filters={filters} onChange={setFilters} resultCount={shown.length} />
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-[var(--rule)] bg-[var(--card)] p-5 text-sm text-[var(--ink2)]">
          No recipes match these filters.
        </p>
      ) : (
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
          {visible.map((r) => (
            <li key={r.id} className="relative">
              <div className="absolute right-2 top-2 z-10">
                <QuickAddButton recipeId={r.id} recipeTitle={r.title} />
              </div>
              <Link
                href={`/recipes/${r.id}`}
                className="block h-full overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--card)] transition-colors hover:border-[var(--ink2)]"
              >
                <DishArt imageUrl={publicImageUrl(r.image_path)} title={r.title} hue={hueForRecipe(r.id)} />
                <div className="p-4">
                  <h2 className="font-display text-lg leading-tight">{r.title}</h2>
                  <div className="mt-2">
                    <MealTypeChips types={r.meal_types} />
                  </div>
                  <div className="mt-2">
                    <TimeLine recipe={r} />
                  </div>
                  <div className="mt-3">
                    <RecipeBadges recipe={r} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {shown.length > limit && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setLimit((n) => n + PAGE_SIZE)}
            className="rounded-lg border border-[var(--rule)] bg-[var(--card)] px-4 py-2 text-sm font-medium hover:border-[var(--ink2)]"
          >
            Show more
          </button>
          <span className="font-mono text-[11px] text-[var(--ink2)]">
            Showing {visible.length} of {shown.length}
          </span>
        </div>
      )}
    </>
  );
}
