import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CookEvent, Slot } from "@/lib/week";
import type { SupabaseClient } from "@supabase/supabase-js";

const RECIPE_COLS =
  "id,title,image_path,base_servings,reheats_well,is_component,scales_cheaply,meal_types,active_min,total_min,flat_cost";

// Get or create the week row for a Monday start date within a household.
// Idempotent. On first creation, the Leber household seeds a default Friday
// dinner (Pizza / Movie Night, fully overridable and gone once changed); other
// households start with an empty week.
export async function weekIdForStart(
  sb: SupabaseClient,
  start: string,
  householdId: string,
): Promise<string> {
  const { data: existing } = await sb
    .from("weeks")
    .select("id")
    .eq("household_id", householdId)
    .eq("start_date", start)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: created, error } = await sb
    .from("weeks")
    .insert({ start_date: start, household_id: householdId })
    .select("id")
    .single();
  if (error || !created) {
    // Lost a create race — the row now exists; re-read it.
    const { data: retry } = await sb
      .from("weeks")
      .select("id")
      .eq("household_id", householdId)
      .eq("start_date", start)
      .single();
    if (retry) return retry.id as string;
    throw error ?? new Error("could not get week");
  }
  const weekId = created.id as string;
  if (householdId === "leber") {
    await sb.from("slots").upsert(
      {
        week_id: weekId,
        day: "fri",
        meal: "dinner",
        fill_type: "out",
        out_label: "Pizza / Movie Night",
        cook_event_id: null,
        sauce: null,
      },
      { onConflict: "week_id,day,meal" },
    );
  }
  return weekId;
}

export type WeekData = {
  weekId: string;
  cookEvents: CookEvent[];
  slots: Slot[];
};

export async function loadWeek(start: string, householdId: string): Promise<WeekData> {
  const sb = getSupabaseAdmin();
  const weekId = await weekIdForStart(sb, start, householdId);

  const [{ data: cookEvents }, { data: slots }] = await Promise.all([
    sb
      .from("cook_events")
      .select(`id,week_id,recipe_id,multiplier,day,kind,recipe:recipes(${RECIPE_COLS})`)
      .eq("week_id", weekId),
    sb.from("slots").select("*").eq("week_id", weekId),
  ]);

  return {
    weekId,
    cookEvents: (cookEvents ?? []) as unknown as CookEvent[],
    slots: (slots ?? []) as Slot[],
  };
}

export type Vote = "yes" | "sure" | "pass";
export type Who = "tyler" | "charity";
export type SuggestionWithVotes = {
  id: string;
  recipe_id: string;
  note: string | null;
  sort_order: number | null;
  recipe: { title: string; image_path: string | null };
  votes: { who: Who; vote: Vote }[];
};

export async function loadSuggestions(
  start: string,
  householdId: string,
): Promise<{ weekId: string; suggestions: SuggestionWithVotes[] }> {
  const sb = getSupabaseAdmin();
  const weekId = await weekIdForStart(sb, start, householdId);
  const { data } = await sb
    .from("suggestions")
    .select("id,recipe_id,note,sort_order,recipe:recipes(title,image_path),votes(who,vote)")
    .eq("week_id", weekId)
    .order("sort_order");
  return { weekId, suggestions: (data ?? []) as unknown as SuggestionWithVotes[] };
}
