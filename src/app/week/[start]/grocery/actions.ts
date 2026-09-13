"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { weekIdForStart } from "@/lib/week-data";
import { requireHousehold } from "@/lib/session";

export async function setGroceryCheck(start: string, itemKey: string, checked: boolean) {
  const household = await requireHousehold();
  const sb = getSupabaseAdmin();
  const weekId = await weekIdForStart(sb, start, household);
  await sb
    .from("grocery_checks")
    .upsert({ week_id: weekId, item_key: itemKey, checked }, { onConflict: "week_id,item_key" });
}

// Set (or clear) the unit price for an item|unit within the caller's household.
// Applies everywhere that ingredient appears for that household. price <= 0 or
// empty removes the price.
export async function setIngredientPrice(
  start: string,
  itemKey: string,
  item: string,
  unit: string | null,
  price: number | null,
) {
  const household = await requireHousehold();
  const sb = getSupabaseAdmin();
  if (price == null || !Number.isFinite(price) || price <= 0) {
    await sb
      .from("ingredient_prices")
      .delete()
      .eq("household_id", household)
      .eq("item_key", itemKey);
  } else {
    await sb.from("ingredient_prices").upsert(
      { household_id: household, item_key: itemKey, item, unit: unit ?? "", unit_price: price, updated_at: new Date().toISOString() },
      { onConflict: "household_id,item_key" },
    );
  }
  revalidatePath(`/week/${start}/grocery`);
  revalidatePath(`/week/${start}`);
}
