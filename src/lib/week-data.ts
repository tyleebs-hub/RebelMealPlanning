import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CookEvent, Slot } from "@/lib/week";
import type { SupabaseClient } from "@supabase/supabase-js";

const RECIPE_COLS =
  "id,title,base_servings,reheats_well,is_component,scales_cheaply,meal_types,active_min,total_min";

// Get or create the week row for a Monday start date. Idempotent.
export async function weekIdForStart(sb: SupabaseClient, start: string): Promise<string> {
  const { data, error } = await sb
    .from("weeks")
    .upsert({ start_date: start }, { onConflict: "start_date" })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("could not get week");
  return data.id as string;
}

export type WeekData = {
  weekId: string;
  cookEvents: CookEvent[];
  slots: Slot[];
};

export async function loadWeek(start: string): Promise<WeekData> {
  const sb = getSupabaseAdmin();
  const weekId = await weekIdForStart(sb, start);

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
  recipe: { title: string };
  votes: { who: Who; vote: Vote }[];
};

export async function loadSuggestions(
  start: string,
): Promise<{ weekId: string; suggestions: SuggestionWithVotes[] }> {
  const sb = getSupabaseAdmin();
  const weekId = await weekIdForStart(sb, start);
  const { data } = await sb
    .from("suggestions")
    .select("id,recipe_id,note,sort_order,recipe:recipes(title),votes(who,vote)")
    .eq("week_id", weekId)
    .order("sort_order");
  return { weekId, suggestions: (data ?? []) as unknown as SuggestionWithVotes[] };
}
