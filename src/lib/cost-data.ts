import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PriceMap } from "@/lib/cost";

export async function loadPrices(): Promise<PriceMap> {
  const sb = getSupabaseAdmin();
  const map: PriceMap = new Map();
  for (let from = 0; ; from += 1000) {
    const { data } = await sb
      .from("ingredient_prices")
      .select("item_key,unit_price")
      .order("item_key")
      .range(from, from + 999);
    const batch = (data ?? []) as { item_key: string; unit_price: number }[];
    for (const r of batch) map.set(r.item_key, Number(r.unit_price));
    if (batch.length < 1000) break;
  }
  return map;
}

export type Budgets = { dinner: number; lunch: number };

export async function loadBudgets(): Promise<Budgets> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("app_settings")
    .select("key,value")
    .in("key", ["weekly_dinner_budget", "weekly_lunch_budget"]);
  const get = (k: string, fallback: number) => {
    const v = (data ?? []).find((r) => r.key === k)?.value;
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return { dinner: get("weekly_dinner_budget", 150), lunch: get("weekly_lunch_budget", 60) };
}
