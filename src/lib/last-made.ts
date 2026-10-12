import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { addDaysIso, dateForDay, weekStartOf, type Day } from "@/lib/week";

// A planned cook counts as made once its day has passed. Stamp each recipe's
// last_made_at with its most recent past cook date (never moving it backward).
// Runs lazily from the Today page and the AI planner, so it stays current
// without a scheduled job. `today` is the household's local date.
export async function stampLastMade(household: string, today: string, lookbackDays = 42): Promise<number> {
  const sb = getSupabaseAdmin();
  const since = addDaysIso(weekStartOf(today), -lookbackDays);
  const { data: weeks, error: wErr } = await sb
    .from("weeks")
    .select("id,start_date")
    .eq("household_id", household)
    .gte("start_date", since)
    .lte("start_date", today);
  if (wErr) throw new Error(`Loading weeks failed: ${wErr.message}`);
  if (!weeks?.length) return 0;

  const startById = new Map((weeks as { id: string; start_date: string }[]).map((w) => [w.id, w.start_date]));
  const { data: cooks, error: cErr } = await sb
    .from("cook_events")
    .select("recipe_id,day,week_id")
    .in("week_id", [...startById.keys()]);
  if (cErr) throw new Error(`Loading cooks failed: ${cErr.message}`);

  const latest = new Map<string, string>();
  for (const c of (cooks ?? []) as { recipe_id: string | null; day: Day | null; week_id: string }[]) {
    if (!c.recipe_id || !c.day) continue;
    const date = dateForDay(startById.get(c.week_id)!, c.day);
    if (date >= today) continue; // not eaten yet
    const prev = latest.get(c.recipe_id);
    if (!prev || date > prev) latest.set(c.recipe_id, date);
  }
  if (latest.size === 0) return 0;

  const { data: recs } = await sb.from("recipes").select("id,last_made_at").in("id", [...latest.keys()]);
  const stale = ((recs ?? []) as { id: string; last_made_at: string | null }[]).filter(
    (r) => !r.last_made_at || r.last_made_at < latest.get(r.id)!,
  );
  await Promise.all(
    stale.map((r) => sb.from("recipes").update({ last_made_at: latest.get(r.id) }).eq("id", r.id)),
  );
  return stale.length;
}
