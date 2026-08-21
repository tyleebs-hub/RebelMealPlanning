import Link from "next/link";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Recipe } from "@/lib/types";
import { MealTypeChips, RecipeBadges, TimeLine } from "@/components/recipe-meta";
import { publicImageUrl } from "@/lib/storage";

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
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Recipe Library
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {recipes.length > 0
            ? `${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"}`
            : "The household cookbook."}
        </p>
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

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {recipes.map((r) => (
          <li key={r.id}>
            <Link
              href={`/recipes/${r.id}`}
              className="block h-full overflow-hidden rounded-xl border border-neutral-200 bg-white transition-colors hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-600 dark:hover:bg-neutral-900"
            >
              {publicImageUrl(r.image_path) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={publicImageUrl(r.image_path)!}
                  alt={r.title}
                  className="h-32 w-full object-cover"
                />
              )}
              <div className="p-4">
              <h2 className="text-lg font-semibold leading-tight">{r.title}</h2>
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
  );
}
