"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { currentSession } from "@/lib/session";

// Rate a recipe 1-5 stars as the signed-in person; 0 clears their rating.
// The recipe must belong to the caller's household.
export async function rateRecipe(recipeId: string, stars: number): Promise<{ ok: boolean }> {
  const session = await currentSession();
  if (!session) return { ok: false };
  const n = Math.round(Number(stars));
  if (!recipeId || !(n >= 0 && n <= 5)) return { ok: false };

  const sb = getSupabaseAdmin();
  const { data: rec } = await sb.from("recipes").select("household_id").eq("id", recipeId).maybeSingle();
  if (rec?.household_id !== session.household) return { ok: false };

  if (n === 0) {
    await sb.from("ratings").delete().eq("recipe_id", recipeId).eq("who", session.who);
  } else {
    const { error } = await sb
      .from("ratings")
      .upsert(
        { recipe_id: recipeId, who: session.who, stars: n, updated_at: new Date().toISOString() },
        { onConflict: "recipe_id,who" },
      );
    if (error) return { ok: false };
  }
  revalidatePath("/today");
  revalidatePath(`/recipes/${recipeId}`);
  return { ok: true };
}
