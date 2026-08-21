"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Recipe } from "@/lib/types";
import { MealTypeChips, RecipeBadges, TimeLine } from "@/components/recipe-meta";
import { publicImageUrl } from "@/lib/storage";
import { DishArt } from "@/components/DishArt";
import { hueForRecipe } from "@/lib/hues";
import { RecipeFilterBar } from "@/components/RecipeFilterBar";
import { EMPTY_FILTERS, matchesFilters, type RecipeFilters } from "@/lib/recipe-filter";

export function RecipeLibraryGrid({ recipes }: { recipes: Recipe[] }) {
  const [filters, setFilters] = useState<RecipeFilters>(EMPTY_FILTERS);

  const shown = useMemo(
    () => recipes.filter((r) => matchesFilters(r, filters)),
    [recipes, filters],
  );

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
          {shown.map((r) => (
            <li key={r.id}>
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
    </>
  );
}
