import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Ingredient, Recipe, Step } from "@/lib/types";
import { RecipeForm, type RecipeFormInitial } from "@/components/RecipeForm";
import { updateRecipe } from "../actions";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

function ingredientLine(i: Ingredient): string {
  if (i.raw_text && i.raw_text.trim()) return i.raw_text.trim();
  const qty = i.qty != null ? String(i.qty) : "";
  return [qty, i.unit ?? "", i.item].filter(Boolean).join(" ").trim();
}

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = getSupabaseAdmin();
  const [{ data: recipe }, { data: ingredients }, { data: steps }] = await Promise.all([
    sb.from("recipes").select("*").eq("id", id).maybeSingle(),
    sb.from("ingredients").select("*").eq("recipe_id", id).order("sort_order"),
    sb.from("steps").select("*").eq("recipe_id", id).order("sort_order"),
  ]);
  if (!recipe) notFound();
  const r = recipe as Recipe;

  const initial: RecipeFormInitial = {
    title: r.title,
    mealTypes: r.meal_types ?? [],
    activeMin: r.active_min != null ? String(r.active_min) : "",
    totalMin: r.total_min != null ? String(r.total_min) : "",
    servings: String(r.base_servings ?? 4),
    sourceName: r.source_name ?? "",
    sourceUrl: r.source_url ?? "",
    ingredients: ((ingredients ?? []) as Ingredient[]).map(ingredientLine).join("\n"),
    steps: ((steps ?? []) as Step[]).map((s) => s.body).join("\n"),
    notes: r.notes ?? "",
    flags: {
      reheats_well: r.reheats_well,
      scales_cheaply: r.scales_cheaply,
      kids_like: r.kids_like,
      is_component: r.is_component,
    },
  };

  return (
    <>
      <AppHeader active="recipes" />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <Link href={`/recipes/${id}`} className="text-sm text-[var(--ink2)] transition-colors hover:text-[var(--ink)]">
          ← {r.title}
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Edit recipe</h1>
        <RecipeForm action={updateRecipe} initial={initial} recipeId={id} submitLabel="Save changes" />
      </main>
    </>
  );
}
