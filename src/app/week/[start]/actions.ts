"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { weekIdForStart, loadWeek } from "@/lib/week-data";
import { currentWho, requireAuth } from "@/lib/session";
import { signSession } from "@/lib/auth";
import { DINNER_SERVINGS, LUNCH_SERVINGS } from "@/lib/types";
import { DAYS, type Day, type Meal } from "@/lib/week";
import { fetchRecipeFromUrl } from "@/app/recipes/new/actions";
import { parseIngredient } from "@/lib/ingredient-parse";

function revalidate(start: string) {
  revalidatePath(`/week/${start}`);
}

function clampMultiplier(n: number): number {
  if (Number.isNaN(n)) return 1;
  return Math.max(1, Math.min(8, Math.round(n)));
}

// Add a cook event. A dinner cook also fills that day's dinner slot.
export async function addCookEvent(formData: FormData) {
  await requireAuth();
  const start = String(formData.get("start"));
  const recipeId = String(formData.get("recipeId"));
  const multiplier = clampMultiplier(Number(formData.get("multiplier") ?? 1));
  const kind = String(formData.get("kind")) === "prep" ? "prep" : "dinner";
  const day = String(formData.get("day") || "") as Day | "";

  if (!recipeId) return;

  const sb = getSupabaseAdmin();
  const weekId = await weekIdForStart(sb, start);

  const { data: ce, error } = await sb
    .from("cook_events")
    .insert({
      week_id: weekId,
      recipe_id: recipeId,
      multiplier,
      day: day || null,
      kind,
    })
    .select("id")
    .single();
  if (error || !ce) throw error ?? new Error("insert cook_event failed");

  if (kind === "dinner" && day) {
    await sb.from("slots").upsert(
      {
        week_id: weekId,
        day,
        meal: "dinner",
        fill_type: "cook",
        cook_event_id: ce.id,
        out_label: null,
      },
      { onConflict: "week_id,day,meal" },
    );
  }

  revalidate(start);
}

// Slot-first: tapping a slot and choosing a recipe creates the cook on that day
// at 1x and fills the slot. Dinner cooks reserve DINNER_SERVINGS; lunch cooks
// are prep-kind (reserve nothing). The multiplier stepper then lives on the slot.
export async function pickCook(start: string, day: Day, meal: Meal, recipeId: string) {
  await requireAuth();
  if (!recipeId) return;
  const kind = meal === "dinner" ? "dinner" : "prep";
  const sb = getSupabaseAdmin();
  const weekId = await weekIdForStart(sb, start);
  const { data: ce, error } = await sb
    .from("cook_events")
    .insert({ week_id: weekId, recipe_id: recipeId, multiplier: 1, day, kind })
    .select("id")
    .single();
  if (error || !ce) throw error ?? new Error("insert cook_event failed");
  await sb.from("slots").upsert(
    { week_id: weekId, day, meal, fill_type: "cook", cook_event_id: ce.id, out_label: null, sauce: null },
    { onConflict: "week_id,day,meal" },
  );
  revalidate(start);
}

export async function setMultiplier(start: string, cookEventId: string, multiplier: number) {
  await requireAuth();
  const sb = getSupabaseAdmin();
  await sb.from("cook_events").update({ multiplier: clampMultiplier(multiplier) }).eq("id", cookEventId);
  revalidate(start);
}

export async function deleteCookEvent(start: string, cookEventId: string) {
  await requireAuth();
  const sb = getSupabaseAdmin();
  // Cascades to slots that pointed at it (see schema on delete cascade).
  await sb.from("cook_events").delete().eq("id", cookEventId);
  revalidate(start);
}

// Assign a leftover lunch (or dinner) slot to a cook event, with optional sauce.
export async function assignLeftover(formData: FormData) {
  await requireAuth();
  const start = String(formData.get("start"));
  const day = String(formData.get("day")) as Day;
  const meal = String(formData.get("meal")) as Meal;
  const cookEventId = String(formData.get("cookEventId"));
  const sauce = String(formData.get("sauce") || "").trim() || null;
  if (!cookEventId) return;

  const sb = getSupabaseAdmin();
  const weekId = await weekIdForStart(sb, start);
  await sb.from("slots").upsert(
    {
      week_id: weekId,
      day,
      meal,
      fill_type: "leftover",
      cook_event_id: cookEventId,
      out_label: null,
      sauce: meal === "lunch" ? sauce : null,
    },
    { onConflict: "week_id,day,meal" },
  );
  revalidate(start);
}

export async function setOut(formData: FormData) {
  await requireAuth();
  const start = String(formData.get("start"));
  const day = String(formData.get("day")) as Day;
  const meal = String(formData.get("meal")) as Meal;
  const label = String(formData.get("label") || "").trim() || (meal === "dinner" ? "Out" : "Out");

  const sb = getSupabaseAdmin();
  const weekId = await weekIdForStart(sb, start);
  await sb.from("slots").upsert(
    {
      week_id: weekId,
      day,
      meal,
      fill_type: "out",
      cook_event_id: null,
      out_label: label,
      sauce: null,
    },
    { onConflict: "week_id,day,meal" },
  );
  revalidate(start);
}

export async function setSauce(start: string, slotId: string, sauce: string) {
  await requireAuth();
  const sb = getSupabaseAdmin();
  await sb.from("slots").update({ sauce: sauce.trim() || null }).eq("id", slotId);
  revalidate(start);
}

export async function clearSlot(start: string, day: Day, meal: Meal) {
  await requireAuth();
  const sb = getSupabaseAdmin();
  const weekId = await weekIdForStart(sb, start);
  await sb.from("slots").delete().eq("week_id", weekId).eq("day", day).eq("meal", meal);
  revalidate(start);
}

// Auto-fill empty lunch slots from reheatable cook events with spare servings,
// preferring the event with the most available. See CLAUDE.md.
export async function autoFillLunches(start: string) {
  await requireAuth();
  const sb = getSupabaseAdmin();
  const weekId = await weekIdForStart(sb, start);

  const [{ data: cookEvents }, { data: slots }] = await Promise.all([
    sb
      .from("cook_events")
      .select("id,multiplier,kind,recipe:recipes(base_servings,reheats_well)")
      .eq("week_id", weekId),
    sb.from("slots").select("day,meal,fill_type,cook_event_id").eq("week_id", weekId),
  ]);

  const events = (cookEvents ?? []) as unknown as {
    id: string;
    multiplier: number;
    kind: string;
    recipe: { base_servings: number; reheats_well: boolean };
  }[];
  const allSlots = (slots ?? []) as { day: string; meal: string; fill_type: string | null; cook_event_id: string | null }[];

  // Running available per event.
  const available = new Map<string, number>();
  for (const ce of events) {
    const produced = ce.recipe.base_servings * ce.multiplier;
    const reserved = ce.kind === "dinner" ? DINNER_SERVINGS : 0;
    available.set(ce.id, produced - reserved);
  }
  for (const s of allSlots) {
    if (s.fill_type === "leftover" && s.cook_event_id) {
      available.set(s.cook_event_id, (available.get(s.cook_event_id) ?? 0) - LUNCH_SERVINGS);
    }
  }

  const lunchFilled = new Set(
    allSlots.filter((s) => s.meal === "lunch" && s.fill_type).map((s) => s.day),
  );

  const reheatable = new Set(events.filter((e) => e.recipe.reheats_well).map((e) => e.id));

  const newSlots: {
    week_id: string;
    day: Day;
    meal: Meal;
    fill_type: string;
    cook_event_id: string;
  }[] = [];

  for (const day of DAYS) {
    if (lunchFilled.has(day)) continue;
    // pick reheatable event with the most available >= LUNCH_SERVINGS
    let best: string | null = null;
    let bestAvail = LUNCH_SERVINGS - 1;
    for (const [id, avail] of available) {
      if (!reheatable.has(id)) continue;
      if (avail > bestAvail) {
        best = id;
        bestAvail = avail;
      }
    }
    if (!best) continue;
    available.set(best, available.get(best)! - LUNCH_SERVINGS);
    newSlots.push({ week_id: weekId, day, meal: "lunch", fill_type: "leftover", cook_event_id: best });
  }

  if (newSlots.length > 0) {
    await sb.from("slots").upsert(newSlots, { onConflict: "week_id,day,meal" });
  }
  revalidate(start);
}

// ---- suggestions & voting ---------------------------------------------------

export async function addSuggestion(formData: FormData) {
  await requireAuth();
  const start = String(formData.get("start"));
  const recipeId = String(formData.get("recipeId"));
  const note = String(formData.get("note") || "").trim() || null;
  if (!recipeId) return;

  const sb = getSupabaseAdmin();
  const weekId = await weekIdForStart(sb, start);
  const { count } = await sb
    .from("suggestions")
    .select("id", { count: "exact", head: true })
    .eq("week_id", weekId);
  await sb.from("suggestions").insert({
    week_id: weekId,
    recipe_id: recipeId,
    note,
    sort_order: (count ?? 0) + 1,
  });
  revalidate(start);
  revalidatePath("/vote");
}

export async function removeSuggestion(start: string, suggestionId: string) {
  await requireAuth();
  const sb = getSupabaseAdmin();
  await sb.from("suggestions").delete().eq("id", suggestionId);
  revalidate(start);
  revalidatePath("/vote");
}

// Cast the current user's vote. "who" is the cookie identity, never trusted
// from the client.
export async function castVote(start: string, recipeId: string, vote: "yes" | "sure" | "pass") {
  const who = await currentWho();
  if (!who) throw new Error("not signed in");
  const sb = getSupabaseAdmin();
  const weekId = await weekIdForStart(sb, start);
  // Votes anchor to a suggestion row per (week, recipe); create it lazily so
  // Charity votes directly on whatever Tyler drafted, with no manual step.
  const { data: existing } = await sb
    .from("suggestions")
    .select("id")
    .eq("week_id", weekId)
    .eq("recipe_id", recipeId)
    .limit(1)
    .maybeSingle();
  let suggestionId = existing?.id as string | undefined;
  if (!suggestionId) {
    const { data: created } = await sb
      .from("suggestions")
      .insert({ week_id: weekId, recipe_id: recipeId })
      .select("id")
      .single();
    suggestionId = created?.id;
  }
  if (!suggestionId) throw new Error("could not record vote");
  await sb.from("votes").upsert({ suggestion_id: suggestionId, who, vote }, { onConflict: "suggestion_id,who" });
  revalidatePath("/vote");
  revalidatePath(`/week/${start}`);
}

// Compact slot map for the quick-add mini-calendar (all 14 slots of a week).
export type SlotBrief = { day: Day; meal: Meal; filled: boolean; label: string | null };

export async function weekSlotBrief(start: string): Promise<SlotBrief[]> {
  await requireAuth();
  const { cookEvents, slots } = await loadWeek(start);
  const eventById = new Map(cookEvents.map((c) => [c.id, c]));
  const byKey = new Map(slots.map((s) => [`${s.day}|${s.meal}`, s]));
  const meals: Meal[] = ["dinner", "lunch"];
  return DAYS.flatMap((day) =>
    meals.map((meal): SlotBrief => {
      const s = byKey.get(`${day}|${meal}`);
      if (!s?.fill_type) return { day, meal, filled: false, label: null };
      let label: string | null = null;
      if (s.fill_type === "out") label = s.out_label ?? "Out";
      else if (s.cook_event_id) label = eventById.get(s.cook_event_id)?.recipe.title ?? null;
      return { day, meal, filled: true, label };
    }),
  );
}

// Charity (or Tyler) suggests a new recipe from a URL on the vote page: import
// it into the library and flag it for this week so it surfaces on the planner.
export async function suggestRecipe(
  start: string,
  rawUrl: string,
  note: string,
): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  const who = await currentWho();
  if (!who) return { ok: false, error: "Not signed in." };

  const fetched = await fetchRecipeFromUrl(rawUrl);
  if (!fetched.ok) return fetched;
  const r = fetched.recipe;

  const sb = getSupabaseAdmin();
  const { data: recipe, error } = await sb
    .from("recipes")
    .insert({
      title: r.title,
      // Suggested from the dinner-vote page — default to dinner; Tyler can relabel.
      meal_types: ["dinner"],
      source_name: r.sourceName,
      source_url: r.sourceUrl,
      active_min: r.activeMin,
      total_min: r.totalMin,
      base_servings: r.servings || 4,
    })
    .select("id")
    .single();
  if (error || !recipe) return { ok: false, error: "Could not save that recipe." };

  if (r.ingredients.length > 0) {
    await sb.from("ingredients").insert(
      r.ingredients.map((line, i) => {
        const p = parseIngredient(line);
        return {
          recipe_id: recipe.id,
          sort_order: i + 1,
          qty: p.qty,
          unit: p.unit,
          item: p.item,
          raw_text: p.raw_text,
        };
      }),
    );
  }
  if (r.steps.length > 0) {
    await sb.from("steps").insert(
      r.steps.map((body, i) => ({ recipe_id: recipe.id, sort_order: i + 1, body })),
    );
  }

  const weekId = await weekIdForStart(sb, start);
  const { count } = await sb
    .from("suggestions")
    .select("id", { count: "exact", head: true })
    .eq("week_id", weekId);
  const { data: suggestion } = await sb
    .from("suggestions")
    .insert({
      week_id: weekId,
      recipe_id: recipe.id,
      note: note.trim() || null,
      sort_order: (count ?? 0) + 1,
    })
    .select("id")
    .single();
  // Record the suggester's own enthusiasm so it reads as a "yes".
  if (suggestion) {
    await sb
      .from("votes")
      .upsert({ suggestion_id: suggestion.id, who, vote: "yes" }, { onConflict: "suggestion_id,who" });
  }

  revalidatePath("/vote");
  revalidatePath(`/week/${start}`);
  return { ok: true, title: r.title };
}

// Generate the shareable vote link + message for Charity. Admin only.
export async function pingCharity(): Promise<{ url: string; message: string }> {
  await requireAuth();
  const token = await signSession("charity");
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const url = `${proto}://${host}/vote/${token}`;
  const message = `Hey! Can you vote on this week's dinner ideas? Tap here (no login needed): ${url}`;
  return { url, message };
}
