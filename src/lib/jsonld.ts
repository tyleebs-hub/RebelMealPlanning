import type { Ingredient, Recipe, Step } from "@/lib/types";

// Build a schema.org/Recipe object for the document head so Safari's
// "Share to Paprika" imports cleanly. See CLAUDE.md > Paprika integration.

function isoDuration(min: number | null | undefined): string | undefined {
  if (min == null || min <= 0) return undefined;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : h ? "" : "0M"}`;
}

function ingredientLine(ing: Ingredient): string {
  if (ing.raw_text && ing.raw_text.trim()) return ing.raw_text.trim();
  const qty = ing.qty != null ? String(ing.qty) : "";
  return [qty, ing.unit ?? "", ing.item].filter(Boolean).join(" ").trim();
}

function storagePublicUrl(imagePath: string): string | undefined {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return undefined;
  return `${base}/storage/v1/object/public/${imagePath}`;
}

export function recipeJsonLd(
  recipe: Recipe,
  ingredients: Ingredient[],
  steps: Step[],
): Record<string, unknown> {
  const total = isoDuration(recipe.total_min);

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    recipeYield: `${recipe.base_servings} servings`,
    recipeIngredient: ingredients.map(ingredientLine).filter(Boolean),
    recipeInstructions: steps
      .filter((s) => s.body && s.body.trim())
      .map((s) => ({ "@type": "HowToStep", text: s.body!.trim() })),
  };

  if (total) jsonLd.totalTime = total;
  if (recipe.notes) jsonLd.description = recipe.notes;
  if (recipe.meal_types.length > 0)
    jsonLd.recipeCategory = recipe.meal_types.join(", ");
  if (recipe.source_name) jsonLd.author = { "@type": "Organization", name: recipe.source_name };
  if (recipe.source_url) jsonLd.isBasedOn = recipe.source_url;

  if (recipe.image_path) {
    const img = storagePublicUrl(recipe.image_path);
    if (img) jsonLd.image = img;
  }

  return jsonLd;
}
