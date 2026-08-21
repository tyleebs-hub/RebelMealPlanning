"use server";

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
