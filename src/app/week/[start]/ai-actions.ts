"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { weekIdForStart } from "@/lib/week-data";
import { requireAuth } from "@/lib/session";
import { isAiConfigured, forcedTool, chatComplete, type ChatMessage } from "@/lib/ai/client";
import { gatherPlanningContext } from "@/lib/ai/context";
import {
  SYSTEM,
  CHAT_SYSTEM,
  formatLibrary,
  formatWeekOpenings,
  formatGenerateUser,
  formatSwapUser,
  PROPOSE_WEEK_TOOL,
  PROPOSE_SWAPS_TOOL,
  SUGGEST_MEALS_TOOL,
} from "@/lib/ai/prompt";
import {
  validateWeekPlan,
  validateSwaps,
  parseChatMeals,
  type Proposal,
  type WeekPlan,
  type Swaps,
  type ChatMeal,
} from "@/lib/ai/validate";
import { parseIngredient } from "@/lib/ingredient-parse";
import { inferAisleAndStaple } from "@/lib/aisle";
import type { Day, Meal } from "@/lib/week";
import { autoFillLunches } from "./actions";

const clampMult = (n: number) => Math.max(1, Math.min(8, Math.round(Number(n) || 1)));

// ---- Generate Week ----------------------------------------------------------

export async function generateWeek(start: string): Promise<{ ok: true; plan: WeekPlan } | { ok: false; error: string }> {
  await requireAuth();
  if (!isAiConfigured) return { ok: false, error: "AI suggestions aren't configured yet." };
  try {
    const ctx = await gatherPlanningContext(start);
    const plan = await forcedTool({
      system: SYSTEM,
      cachedContext: formatLibrary(ctx),
      userContent: formatGenerateUser(ctx),
      tool: PROPOSE_WEEK_TOOL,
      validate: (input) => validateWeekPlan(input, ctx),
    });
    return { ok: true, plan };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function acceptProposals(start: string, proposals: Proposal[]): Promise<void> {
  await requireAuth();
  const sb = getSupabaseAdmin();
  const weekId = await weekIdForStart(sb, start);

  for (const p of proposals) {
    if (!p?.recipeId) continue;
    const kind = p.kind === "prep" ? "prep" : "dinner";
    const { data: ce } = await sb
      .from("cook_events")
      .insert({ week_id: weekId, recipe_id: p.recipeId, multiplier: clampMult(p.multiplier), day: p.day, kind })
      .select("id")
      .single();
    if (ce && kind === "dinner") {
      await sb.from("slots").upsert(
        { week_id: weekId, day: p.day, meal: "dinner", fill_type: "cook", cook_event_id: ce.id, out_label: null, sauce: null },
        { onConflict: "week_id,day,meal" },
      );
    }
  }

  await autoFillLunches(start); // fill lunch slots from the new spare servings
  revalidatePath(`/week/${start}`);
}

// ---- Brainstorm chat --------------------------------------------------------

export async function planChat(
  start: string,
  history: ChatMessage[],
): Promise<{ ok: true; reply: string; suggestions: ChatMeal[] } | { ok: false; error: string }> {
  await requireAuth();
  if (!isAiConfigured) return { ok: false, error: "AI suggestions aren't configured yet." };
  const messages = (history ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12); // keep the last few turns
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return { ok: false, error: "Say something first." };
  }
  try {
    const ctx = await gatherPlanningContext(start);
    const { text, toolInput } = await chatComplete({
      system: `${CHAT_SYSTEM}\n\n${formatWeekOpenings(ctx)}`,
      cachedContext: formatLibrary(ctx),
      messages,
      tool: SUGGEST_MEALS_TOOL,
    });
    return { ok: true, reply: text || "…", suggestions: parseChatMeals(toolInput, ctx) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Commit one chat-suggested meal: a library recipe → cook that day; a new dish →
// save it to the library (ingredients + steps + inferred aisles) then cook it.
export async function addChatMeal(
  start: string,
  meal: ChatMeal,
): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  await requireAuth();
  if (!meal || (meal.meal !== "dinner" && meal.meal !== "lunch")) return { ok: false, error: "Bad meal." };
  try {
    const sb = getSupabaseAdmin();
    const weekId = await weekIdForStart(sb, start);

    let recipeId = meal.recipeId;
    if (!recipeId) {
      const title = (meal.title || "").trim();
      if (!title) return { ok: false, error: "No recipe to add." };
      const { data: rec, error } = await sb
        .from("recipes")
        .insert({
          title,
          meal_types: [meal.meal],
          reheats_well: meal.reheatsWell ?? meal.meal === "lunch",
          base_servings: 4,
          source_name: "AI idea",
        })
        .select("id")
        .single();
      if (error || !rec) return { ok: false, error: "Could not save the recipe." };
      recipeId = rec.id as string;

      const ingLines = (meal.ingredients ?? []).map((s) => s.trim()).filter(Boolean);
      if (ingLines.length) {
        await sb.from("ingredients").insert(
          ingLines.map((line, i) => {
            const p = parseIngredient(line);
            const { aisle, staple } = inferAisleAndStaple(p.item);
            return { recipe_id: recipeId, sort_order: i + 1, qty: p.qty, unit: p.unit, item: p.item, raw_text: p.raw_text, aisle, is_pantry_staple: staple };
          }),
        );
      }
      const stepLines = (meal.steps ?? []).map((s) => s.trim()).filter(Boolean);
      if (stepLines.length) {
        await sb.from("steps").insert(stepLines.map((body, i) => ({ recipe_id: recipeId, sort_order: i + 1, body })));
      }
    } else {
      const { data } = await sb.from("recipes").select("id").eq("id", recipeId).maybeSingle();
      if (!data) return { ok: false, error: "Recipe not found." };
    }

    const kind = meal.meal === "dinner" ? "dinner" : "prep";
    const { data: ce } = await sb
      .from("cook_events")
      .insert({ week_id: weekId, recipe_id: recipeId, multiplier: clampMult(meal.multiplier), day: meal.day, kind })
      .select("id")
      .single();
    if (ce) {
      await sb.from("slots").upsert(
        { week_id: weekId, day: meal.day, meal: meal.meal, fill_type: "cook", cook_event_id: ce.id, out_label: null, sauce: null },
        { onConflict: "week_id,day,meal" },
      );
    }
    await autoFillLunches(start);
    revalidatePath(`/week/${start}`);
    return { ok: true, title: meal.title };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---- Charity's Swap ---------------------------------------------------------

export async function swapSlot(
  start: string,
  day: Day,
  meal: Meal,
  reason?: string,
): Promise<{ ok: true; swaps: Swaps } | { ok: false; error: string }> {
  await requireAuth();
  if (!isAiConfigured) return { ok: false, error: "AI suggestions aren't configured yet." };
  try {
    const ctx = await gatherPlanningContext(start);
    const slot = ctx.slots.find((s) => s.day === day && s.meal === meal);
    let currentTitle: string | null = null;
    let lunchesFed = 0;
    if (slot?.cook_event_id) {
      const ce = ctx.cookEvents.find((c) => c.id === slot.cook_event_id);
      currentTitle = ce?.recipe.title ?? null;
      if (ce) {
        lunchesFed = ctx.slots.filter(
          (s) => s.cook_event_id === ce.id && s.meal === "lunch" && s.fill_type === "leftover",
        ).length;
      }
    } else if (slot?.out_label) {
      currentTitle = slot.out_label;
    }
    // Don't offer the dishes already used this week (incl. the one being swapped)
    // as candidates — hiding them prevents the model from re-proposing the current
    // dish and getting confused.
    const excludeIds = new Set(ctx.cookEvents.map((c) => c.recipe_id));
    const swaps = await forcedTool({
      system: SYSTEM,
      cachedContext: formatLibrary(ctx, excludeIds),
      userContent: formatSwapUser(ctx, day, meal, currentTitle, lunchesFed, reason),
      tool: PROPOSE_SWAPS_TOOL,
      validate: (input) => validateSwaps(input, ctx),
    });
    // Safety net: never return an excluded recipe.
    swaps.options = swaps.options.filter((o) => !excludeIds.has(o.recipeId));
    if (swaps.options.length === 0) return { ok: false, error: "Couldn't find distinct alternatives — try again." };
    return { ok: true, swaps };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function applySwap(
  start: string,
  day: Day,
  meal: Meal,
  recipeId: string,
  multiplier: number,
): Promise<void> {
  await requireAuth();
  const sb = getSupabaseAdmin();
  const weekId = await weekIdForStart(sb, start);

  const { data: slot } = await sb
    .from("slots")
    .select("fill_type,cook_event_id")
    .eq("week_id", weekId)
    .eq("day", day)
    .eq("meal", meal)
    .maybeSingle();
  // If this slot IS a cook (its origin), removing the cook cascades its leftovers.
  if (slot?.cook_event_id && slot.fill_type === "cook") {
    await sb.from("cook_events").delete().eq("id", slot.cook_event_id);
  } else if (slot) {
    await sb.from("slots").delete().eq("week_id", weekId).eq("day", day).eq("meal", meal);
  }

  const kind = meal === "dinner" ? "dinner" : "prep";
  const { data: ce } = await sb
    .from("cook_events")
    .insert({ week_id: weekId, recipe_id: recipeId, multiplier: clampMult(multiplier), day, kind })
    .select("id")
    .single();
  if (ce) {
    await sb.from("slots").upsert(
      { week_id: weekId, day, meal, fill_type: "cook", cook_event_id: ce.id, out_label: null, sauce: null },
      { onConflict: "week_id,day,meal" },
    );
  }

  await autoFillLunches(start); // restore lunch coverage from the new cook
  revalidatePath(`/week/${start}`);
  revalidatePath("/vote");
}
