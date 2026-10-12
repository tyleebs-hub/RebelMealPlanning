import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Who } from "@/lib/auth";

export type RatingEntry = { who: Who; stars: number };

// Every household member's star rating for the given recipes.
export async function loadRatings(recipeIds: string[]): Promise<Map<string, RatingEntry[]>> {
  const out = new Map<string, RatingEntry[]>();
  if (recipeIds.length === 0) return out;
  const sb = getSupabaseAdmin();
  for (let i = 0; i < recipeIds.length; i += 150) {
    const { data, error } = await sb
      .from("ratings")
      .select("recipe_id,who,stars")
      .in("recipe_id", recipeIds.slice(i, i + 150));
    if (error) throw new Error(`Loading ratings failed: ${error.message}`);
    for (const r of (data ?? []) as { recipe_id: string; who: Who; stars: number }[]) {
      (out.get(r.recipe_id) ?? out.set(r.recipe_id, []).get(r.recipe_id)!).push({ who: r.who, stars: r.stars });
    }
  }
  return out;
}

// Average stars across everyone who rated, or null if nobody has.
export function averageStars(entries: RatingEntry[] | undefined): number | null {
  if (!entries?.length) return null;
  return entries.reduce((s, e) => s + e.stars, 0) / entries.length;
}
