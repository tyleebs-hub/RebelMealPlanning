"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/session";
import { parseIngredient } from "@/lib/ingredient-parse";
import { inferAisleAndStaple } from "@/lib/aisle";
import { importImageFromUrl } from "@/lib/import-image";
import type { MealType } from "@/lib/types";

const ALLOWED_FLAGS = new Set(["reheats_well", "kids_like", "scales_cheaply"]);
const ALLOWED_MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack", "drink", "dessert", "side"];

// Toggle a boolean recipe flag from the recipe page.
export async function setRecipeFlag(recipeId: string, field: string, value: boolean) {
  await requireAuth();
  if (!ALLOWED_FLAGS.has(field)) return;
  const sb = getSupabaseAdmin();
  await sb.from("recipes").update({ [field]: value }).eq("id", recipeId);
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
}

function lines(v: FormDataEntryValue | null): string[] {
  return String(v || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

// Edit an existing recipe: update fields and replace its ingredients + steps.
export async function updateRecipe(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "").trim();
  if (!id || !title) return;

  const mealTypes = formData
    .getAll("meal_types")
    .map(String)
    .filter((t): t is MealType => ALLOWED_MEAL_TYPES.includes(t as MealType));

  const num = (name: string): number | null => {
    const v = String(formData.get(name) || "").trim();
    if (!v) return null;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  };
  const bool = (name: string) => formData.get(name) === "on";

  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("recipes")
    .update({
      title,
      meal_types: mealTypes,
      source_name: String(formData.get("source_name") || "").trim() || null,
      source_url: String(formData.get("source_url") || "").trim() || null,
      active_min: num("active_min"),
      total_min: num("total_min"),
      base_servings: num("base_servings") ?? 4,
      reheats_well: bool("reheats_well"),
      scales_cheaply: bool("scales_cheaply"),
      kids_like: bool("kids_like"),
      is_component: bool("is_component"),
      notes: String(formData.get("notes") || "").trim() || null,
    })
    .eq("id", id);
  if (error) throw error;

  // Replace ingredients (re-inferring aisle/staple) and steps.
  await sb.from("ingredients").delete().eq("recipe_id", id);
  const ingLines = lines(formData.get("ingredients"));
  if (ingLines.length > 0) {
    await sb.from("ingredients").insert(
      ingLines.map((line, i) => {
        const p = parseIngredient(line);
        const { aisle, staple } = inferAisleAndStaple(p.item);
        return {
          recipe_id: id,
          sort_order: i + 1,
          qty: p.qty,
          unit: p.unit,
          item: p.item,
          raw_text: p.raw_text,
          aisle,
          is_pantry_staple: staple,
        };
      }),
    );
  }

  await sb.from("steps").delete().eq("recipe_id", id);
  const stepLines = lines(formData.get("steps"));
  if (stepLines.length > 0) {
    await sb.from("steps").insert(
      stepLines.map((body, i) => ({ recipe_id: id, sort_order: i + 1, body })),
    );
  }

  // Pull a hero image if one was imported and the recipe has no photo yet.
  const imageUrl = String(formData.get("image_url") || "").trim();
  if (imageUrl) {
    const { data: cur } = await sb.from("recipes").select("image_path").eq("id", id).single();
    if (!cur?.image_path) await importImageFromUrl(sb, id, imageUrl);
  }

  revalidatePath(`/recipes/${id}`);
  revalidatePath("/recipes");
  redirect(`/recipes/${id}`);
}

// Delete a recipe. cook_events and suggestions reference it without cascade, so
// clear those first (they cascade to slots and votes); ingredients/steps/ratings
// cascade from the recipe itself.
export async function deleteRecipe(recipeId: string) {
  await requireAuth();
  const sb = getSupabaseAdmin();
  await sb.from("cook_events").delete().eq("recipe_id", recipeId);
  await sb.from("suggestions").delete().eq("recipe_id", recipeId);
  await sb.from("recipes").delete().eq("id", recipeId);
  revalidatePath("/recipes");
  redirect("/recipes");
}
