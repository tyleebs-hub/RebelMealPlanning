"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/session";

const ALLOWED = new Set(["reheats_well", "kids_like", "scales_cheaply"]);

// Toggle a boolean recipe flag from the recipe page.
export async function setRecipeFlag(recipeId: string, field: string, value: boolean) {
  await requireAuth();
  if (!ALLOWED.has(field)) return;
  const sb = getSupabaseAdmin();
  await sb.from("recipes").update({ [field]: value }).eq("id", recipeId);
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
}
