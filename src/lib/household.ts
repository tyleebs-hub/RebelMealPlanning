import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_CONFIG, type HouseholdConfig } from "@/lib/types";

// Read a household's serving math + weekly targets from app_settings, falling
// back to the Leber defaults for any key that isn't set. See CLAUDE.md >
// Households.
export async function loadHouseholdConfig(householdId: string): Promise<HouseholdConfig> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("app_settings")
    .select("key,value")
    .eq("household_id", householdId)
    .in("key", ["dinner_servings", "lunch_servings", "target_dinners", "target_lunches"]);

  const get = (key: string, fallback: number): number => {
    const v = (data ?? []).find((r) => r.key === key)?.value;
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
  };

  return {
    dinnerServings: get("dinner_servings", DEFAULT_CONFIG.dinnerServings),
    lunchServings: get("lunch_servings", DEFAULT_CONFIG.lunchServings),
    targetDinners: get("target_dinners", DEFAULT_CONFIG.targetDinners),
    targetLunches: get("target_lunches", DEFAULT_CONFIG.targetLunches),
  };
}
