"use server";

import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/session";
import { parseIngredient } from "@/lib/ingredient-parse";
import { inferAisleAndStaple } from "@/lib/aisle";
import { importImageFromUrl } from "@/lib/import-image";
import { parseRecipeFromHtml, type ParsedWebRecipe } from "@/lib/recipe-jsonld-parse";
import type { MealType } from "@/lib/types";

const ALLOWED_MEAL_TYPES: MealType[] = [
  "breakfast", "lunch", "dinner", "snack", "drink", "dessert", "side",
];

function isSafeUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  // Basic SSRF guard: no localhost / private ranges.
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "127.0.0.1" ||
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    host.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return null;
  }
  return u;
}

export type FetchResult =
  | { ok: true; recipe: ParsedWebRecipe }
  | { ok: false; error: string };

export async function fetchRecipeFromUrl(rawUrl: string): Promise<FetchResult> {
  await requireAuth();
  const url = isSafeUrl(rawUrl.trim());
  if (!url) return { ok: false, error: "Enter a valid http(s) recipe URL." };

  let html: string;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (MealPlanner recipe import)" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return { ok: false, error: `The site returned ${res.status}.` };
    html = await res.text();
  } catch {
    return { ok: false, error: "Could not reach that URL." };
  }

  const recipe = parseRecipeFromHtml(html, url.toString());
  if (!recipe) {
    return { ok: false, error: "No recipe data found on that page. You can still fill it in by hand." };
  }
  return { ok: true, recipe };
}

export async function createRecipe(formData: FormData) {
  await requireAuth();

  const title = String(formData.get("title") || "").trim();
  if (!title) return;

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
  const { data: recipe, error } = await sb
    .from("recipes")
    .insert({
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
    .select("id")
    .single();
  if (error || !recipe) throw error ?? new Error("insert failed");

  const ingredientLines = String(formData.get("ingredients") || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (ingredientLines.length > 0) {
    await sb.from("ingredients").insert(
      ingredientLines.map((line, i) => {
        const p = parseIngredient(line);
        const { aisle, staple } = inferAisleAndStaple(p.item);
        return {
          recipe_id: recipe.id,
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

  const stepLines = String(formData.get("steps") || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (stepLines.length > 0) {
    await sb.from("steps").insert(
      stepLines.map((body, i) => ({ recipe_id: recipe.id, sort_order: i + 1, body })),
    );
  }

  // Pull the hero image from the imported page, if one was found (best-effort).
  const imageUrl = String(formData.get("image_url") || "").trim();
  if (imageUrl) await importImageFromUrl(sb, recipe.id, imageUrl);

  redirect(`/recipes/${recipe.id}`);
}
