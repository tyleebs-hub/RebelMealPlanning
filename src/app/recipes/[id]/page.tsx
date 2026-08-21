import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Ingredient, Recipe, Step } from "@/lib/types";
import { MealTypeChips, RecipeBadges, TimeLine } from "@/components/recipe-meta";
import { recipeJsonLd } from "@/lib/jsonld";
import { publicImageUrl } from "@/lib/storage";
import { PhotoUpload } from "@/components/PhotoUpload";
import { DishArt } from "@/components/DishArt";
import { hueForRecipe } from "@/lib/hues";
import { AppHeader } from "@/components/AppHeader";
import { QuickAddButton } from "@/components/week/QuickAdd";
import { recipeCost, money } from "@/lib/cost";
import { loadPrices } from "@/lib/cost-data";

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]";

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
  const rc = recipeCost(ings, await loadPrices());
  const jsonLd = recipeJsonLd(r, ings, stps);
  const imageUrl = publicImageUrl(r.image_path);

  return (
    <>
      <AppHeader active="recipes" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      {/* schema.org/Recipe for Safari > Share to Paprika. See CLAUDE.md. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BackLink />

      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--rule)]">
        <DishArt imageUrl={imageUrl} title={r.title} hue={hueForRecipe(r.id)} tall />
      </div>
      <div className="mt-2">
        <PhotoUpload recipeId={r.id} hasPhoto={!!imageUrl} />
      </div>

      <header className="mt-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-2xl tracking-tight sm:text-3xl">{r.title}</h1>
          <div className="shrink-0">
            <QuickAddButton recipeId={r.id} recipeTitle={r.title} variant="full" />
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <MealTypeChips types={r.meal_types} />
          <TimeLine recipe={r} />
          <RecipeBadges recipe={r} />
        </div>
        <p className="mt-3 font-mono text-xs text-[var(--ink2)]">
          Makes {r.base_servings} servings
          {rc.cost > 0 && (
            <>
              {" · "}
              <span className="text-[var(--ink)]">≈ {money(rc.cost)}</span>
              {" ("}
              {money(rc.cost / r.base_servings)}/serving
              {rc.unpriced > 0 ? `, ${rc.unpriced} unpriced` : ""})
            </>
          )}
          {r.source_name ? ` · ${r.source_name}` : ""}
        </p>
      </header>

      {r.notes && (
        <p className="mt-5 rounded-lg bg-[var(--card)] p-4 text-sm text-[var(--ink2)]">{r.notes}</p>
      )}

      <section className="mt-8">
        <h2 className={EYEBROW}>Ingredients</h2>
        {ings.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ink2)]">No ingredients listed.</p>
        ) : (
          <ul className="mt-3 flex flex-col">
            {ings.map((ing) => (
              <li key={ing.id} className="flex items-baseline gap-2 border-b border-[var(--rule2)] py-1.5 text-sm">
                <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--rule)" }} />
                <span>{ingredientLine(ing)}</span>
                {ing.is_pantry_staple && <span className="text-xs text-[var(--ink2)]">(staple)</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className={EYEBROW}>Steps</h2>
        {stps.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ink2)]">No steps listed.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {stps.map((s, i) => (
              <li key={s.id} className="flex gap-3 text-sm leading-relaxed">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] font-mono text-xs text-[var(--paper)]">
                  {i + 1}
                </span>
                <span className="pt-0.5">{s.body}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      </main>
    </>
  );
}

function BackLink() {
  return (
    <Link
      href="/recipes"
      className="text-sm text-[var(--ink2)] transition-colors hover:text-[var(--ink)]"
    >
      ← All recipes
    </Link>
  );
}
