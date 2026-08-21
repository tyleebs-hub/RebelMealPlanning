import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Ingredient, Recipe, Step } from "@/lib/types";
import { MealTypeChips, RecipeBadges, TimeLine } from "@/components/recipe-meta";
import { recipeJsonLd } from "@/lib/jsonld";

export const dynamic = "force-dynamic";

function ingredientLine(ing: Ingredient): string {
  if (ing.raw_text) return ing.raw_text;
  const qty = ing.qty != null ? String(ing.qty) : "";
  return [qty, ing.unit ?? "", ing.item].filter(Boolean).join(" ").trim();
}

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabase();

  if (!isSupabaseConfigured || !supabase) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <BackLink />
        <div className="mt-6 rounded-xl border border-amber-400/60 bg-amber-50 p-5 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          Supabase not connected yet. See{" "}
          <code className="font-mono">.env.local.example</code>.
        </div>
      </main>
    );
  }

  const [{ data: recipe }, { data: ingredients }, { data: steps }] =
    await Promise.all([
      supabase.from("recipes").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("ingredients")
        .select("*")
        .eq("recipe_id", id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("steps")
        .select("*")
        .eq("recipe_id", id)
        .order("sort_order", { ascending: true }),
    ]);

  if (!recipe) notFound();

  const r = recipe as Recipe;
  const ings = (ingredients ?? []) as Ingredient[];
  const stps = (steps ?? []) as Step[];
  const jsonLd = recipeJsonLd(r, ings, stps);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      {/* schema.org/Recipe for Safari > Share to Paprika. See CLAUDE.md. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BackLink />

      <header className="mt-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {r.title}
        </h1>
        <div className="mt-3 flex flex-col gap-2">
          <MealTypeChips types={r.meal_types} />
          <TimeLine recipe={r} />
          <RecipeBadges recipe={r} />
        </div>
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
          Makes {r.base_servings} servings
          {r.source_name ? ` · ${r.source_name}` : ""}
        </p>
      </header>

      {r.notes && (
        <p className="mt-5 rounded-lg bg-neutral-50 p-4 text-sm text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
          {r.notes}
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Ingredients</h2>
        {ings.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No ingredients listed.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {ings.map((ing) => (
              <li key={ing.id} className="flex items-baseline gap-2 text-sm">
                <span
                  aria-hidden
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-600"
                />
                <span>{ingredientLine(ing)}</span>
                {ing.is_pantry_staple && (
                  <span className="text-xs text-neutral-400">(staple)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Steps</h2>
        {stps.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No steps listed.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {stps.map((s, i) => (
              <li key={s.id} className="flex gap-3 text-sm leading-relaxed">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white dark:bg-white dark:text-neutral-900">
                  {i + 1}
                </span>
                <span className="pt-0.5">{s.body}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function BackLink() {
  return (
    <Link
      href="/recipes"
      className="text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-neutral-200"
    >
      ← All recipes
    </Link>
  );
}
