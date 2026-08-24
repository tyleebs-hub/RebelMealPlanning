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
} from "@/lib/ai/prompt";
import { validateWeekPlan, validateSwaps, type Proposal, type WeekPlan, type Swaps } from "@/lib/ai/validate";
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
): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
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
    const reply = await chatComplete({
      system: `${CHAT_SYSTEM}\n\n${formatWeekOpenings(ctx)}`,
      cachedContext: formatLibrary(ctx),
      messages,
    });
    return { ok: true, reply: reply || "…" };
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
    const swaps = await forcedTool({
      system: SYSTEM,
      cachedContext: formatLibrary(ctx),
      userContent: formatSwapUser(ctx, day, meal, currentTitle, lunchesFed, reason),
      tool: PROPOSE_SWAPS_TOOL,
      validate: (input) => validateSwaps(input, ctx),
    });
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
