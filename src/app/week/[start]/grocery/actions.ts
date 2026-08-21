"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { weekIdForStart } from "@/lib/week-data";
import { requireAuth } from "@/lib/session";

export async function setGroceryCheck(start: string, itemKey: string, checked: boolean) {
  await requireAuth();
  const sb = getSupabaseAdmin();
  const weekId = await weekIdForStart(sb, start);
  await sb
    .from("grocery_checks")
    .upsert({ week_id: weekId, item_key: itemKey, checked }, { onConflict: "week_id,item_key" });
}

// Set (or clear) the shared unit price for an item|unit. Applies everywhere that
// ingredient appears. price <= 0 or empty removes the price.
export async function setIngredientPrice(
  start: string,
  itemKey: string,
  item: string,
  unit: string | null,
  price: number | null,
) {
  await requireAuth();
  const sb = getSupabaseAdmin();
  if (price == null || !Number.isFinite(price) || price <= 0) {
    await sb.from("ingredient_prices").delete().eq("item_key", itemKey);
  } else {
    await sb.from("ingredient_prices").upsert(
      { item_key: itemKey, item, unit: unit ?? "", unit_price: price, updated_at: new Date().toISOString() },
      { onConflict: "item_key" },
    );
  }
  revalidatePath(`/week/${start}/grocery`);
  revalidatePath(`/week/${start}`);
}
