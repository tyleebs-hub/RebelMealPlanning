import Link from "next/link";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Recipe } from "@/lib/types";
import { MealTypeChips, RecipeBadges, TimeLine } from "@/components/recipe-meta";
import { publicImageUrl } from "@/lib/storage";
import { DishArt } from "@/components/DishArt";
import { hueForRecipe } from "@/lib/hues";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

function SetupNotice() {
  return (
    <div className="rounded-xl border border-amber-400/60 bg-amber-50 p-5 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      <p className="font-semibold">Supabase not connected yet</p>
      <p className="mt-1">
        Set <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
        <code className="font-mono">.env.local</code>, then apply the migration
        and seed. See <code className="font-mono">.env.local.example</code>.
      </p>
    </div>
  );
}

export default async function RecipesPage() {
  const supabase = getSupabase();

  let recipes: Recipe[] = [];
  let loadError: string | null = null;

  if (supabase) {
    const { data, error } = await supabase
      .from("recipes")
      .select("*")
      .order("title", { ascending: true });
    if (error) loadError = error.message;
    else recipes = (data ?? []) as Recipe[];
  }

  return (
    <>
      <AppHeader active="recipes" />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]">The cookbook</div>
          <h1 className="font-display text-2xl tracking-tight sm:text-3xl">Recipe Library</h1>
          <p className="mt-1 font-mono text-xs text-[var(--ink2)]">
            {recipes.length > 0
              ? `${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"}`
              : "The household cookbook."}
          </p>
        </div>
        <Link
          href="/recipes/new"
          className="shrink-0 rounded-lg bg-[var(--ink)] px-3 py-2 text-sm font-medium text-[var(--paper)] hover:opacity-90"
        >
          Add recipe
        </Link>
      </header>

      {!isSupabaseConfigured && <SetupNotice />}

      {isSupabaseConfigured && loadError && (
        <div className="rounded-xl border border-red-400/60 bg-red-50 p-5 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
          <p className="font-semibold">Could not load recipes</p>
          <p className="mt-1 font-mono text-xs">{loadError}</p>
        </div>
      )}

      {isSupabaseConfigured && !loadError && recipes.length === 0 && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
          No recipes yet. Run the seed in{" "}
          <code className="font-mono">supabase/seed.sql</code> to add the first
          three.
        </div>
      )}

      <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
        {recipes.map((r) => (
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
      </main>
    </>
  );
}
