"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { weekIdForStart } from "@/lib/week-data";
import { currentRole, requireAdmin } from "@/lib/session";
import { signSession } from "@/lib/auth";
import { DINNER_SERVINGS, LUNCH_SERVINGS } from "@/lib/types";
import { DAYS, type Day, type Meal } from "@/lib/week";

function revalidate(start: string) {
  revalidatePath(`/week/${start}`);
}

function clampMultiplier(n: number): number {
  if (Number.isNaN(n)) return 1;
  return Math.max(1, Math.min(8, Math.round(n)));
}

// Add a cook event. A dinner cook also fills that day's dinner slot.
export async function addCookEvent(formData: FormData) {
  await requireAdmin();
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

export async function setMultiplier(start: string, cookEventId: string, multiplier: number) {
  await requireAdmin();
  const sb = getSupabaseAdmin();
  await sb.from("cook_events").update({ multiplier: clampMultiplier(multiplier) }).eq("id", cookEventId);
  revalidate(start);
}

export async function deleteCookEvent(start: string, cookEventId: string) {
  await requireAdmin();
  const sb = getSupabaseAdmin();
  // Cascades to slots that pointed at it (see schema on delete cascade).
  await sb.from("cook_events").delete().eq("id", cookEventId);
  revalidate(start);
}

// Assign a leftover lunch (or dinner) slot to a cook event, with optional sauce.
export async function assignLeftover(formData: FormData) {
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
  const sb = getSupabaseAdmin();
  await sb.from("slots").update({ sauce: sauce.trim() || null }).eq("id", slotId);
  revalidate(start);
}

export async function clearSlot(start: string, day: Day, meal: Meal) {
  await requireAdmin();
  const sb = getSupabaseAdmin();
  const weekId = await weekIdForStart(sb, start);
  await sb.from("slots").delete().eq("week_id", weekId).eq("day", day).eq("meal", meal);
  revalidate(start);
}

// Auto-fill empty lunch slots from reheatable cook events with spare servings,
// preferring the event with the most available. See CLAUDE.md.
export async function autoFillLunches(start: string) {
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
  const sb = getSupabaseAdmin();
  await sb.from("suggestions").delete().eq("id", suggestionId);
  revalidate(start);
  revalidatePath("/vote");
}

// Cast the current user's vote. "who" is derived from role, never trusted from
// the client: admin = tyler, household = charity.
export async function castVote(suggestionId: string, vote: "yes" | "sure" | "pass") {
  const role = await currentRole();
  if (!role) throw new Error("not signed in");
  const who = role === "admin" ? "tyler" : "charity";
  const sb = getSupabaseAdmin();
  await sb
    .from("votes")
    .upsert({ suggestion_id: suggestionId, who, vote }, { onConflict: "suggestion_id,who" });
  revalidatePath("/vote");
}

// Generate the shareable vote link + message for Charity. Admin only.
export async function pingCharity(): Promise<{ url: string; message: string }> {
  await requireAdmin();
  const token = await signSession("household");
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const url = `${proto}://${host}/vote/${token}`;
  const message = `Hey! Can you vote on this week's dinner ideas? Tap here (no login needed): ${url}`;
  return { url, message };
}
