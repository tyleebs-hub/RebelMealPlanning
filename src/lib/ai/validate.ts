import { DAYS, type Coverage, type Day } from "@/lib/week";
import { DINNER_SERVINGS, LUNCH_SERVINGS, TARGET_DINNERS, TARGET_LUNCHES } from "@/lib/types";
import type { PlanningContext } from "@/lib/ai/context";
import type { Validated } from "@/lib/ai/client";

export type Proposal = {
  recipeId: string;
  title: string;
  day: Day;
  kind: "dinner" | "prep";
  multiplier: number;
  rationale: string;
};
export type WeekPlan = { summary: string; proposals: Proposal[]; coverage: Coverage };

const isDay = (d: unknown): d is Day => typeof d === "string" && (DAYS as readonly string[]).includes(d);
const intInRange = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 8;

// Coarse coverage estimate for a set of cooks (existing + proposed). The real
// autofill runs on accept; this just verifies the plan is roughly sound.
function estimateCoverage(
  ctx: PlanningContext,
  proposals: Proposal[],
): Coverage {
  const dinnerDays = new Set<Day>();
  for (const s of ctx.slots) if (s.meal === "dinner" && s.fill_type) dinnerDays.add(s.day);
  for (const p of proposals) if (p.kind === "dinner") dinnerDays.add(p.day);

  let reheatableSpare = 0;
  for (const c of ctx.cookEvents) {
    if (!c.recipe.reheats_well) continue;
    const produced = c.recipe.base_servings * c.multiplier;
    reheatableSpare += Math.max(0, produced - (c.kind === "dinner" ? DINNER_SERVINGS : 0));
  }
  for (const p of proposals) {
    const r = ctx.libraryById.get(p.recipeId);
    if (!r || !r.reheats_well) continue;
    const produced = r.base_servings * p.multiplier;
    reheatableSpare += Math.max(0, produced - (p.kind === "dinner" ? DINNER_SERVINGS : 0));
  }

  const lunchSlots = Math.min(TARGET_LUNCHES, Math.floor(reheatableSpare / LUNCH_SERVINGS));
  return {
    dinnersFilled: Math.min(TARGET_DINNERS, dinnerDays.size),
    dinnerTarget: TARGET_DINNERS,
    lunchPortions: lunchSlots * LUNCH_SERVINGS,
    lunchTarget: TARGET_LUNCHES * LUNCH_SERVINGS,
  };
}

export function validateWeekPlan(input: unknown, ctx: PlanningContext): Validated<WeekPlan> {
  if (!input || typeof input !== "object") return { ok: false, error: "Malformed response." };
  const obj = input as { summary?: unknown; cooks?: unknown };
  if (typeof obj.summary !== "string") return { ok: false, error: "Missing summary." };
  if (!Array.isArray(obj.cooks)) return { ok: false, error: "Missing cooks array." };

  const proposals: Proposal[] = [];
  for (const c of obj.cooks as Record<string, unknown>[]) {
    const r = typeof c.recipe_id === "string" ? ctx.libraryById.get(c.recipe_id) : undefined;
    if (!r) return { ok: false, error: `Unknown recipe_id "${String(c.recipe_id)}". Use only ids from the library.` };
    if (!isDay(c.day)) return { ok: false, error: `Invalid day "${String(c.day)}".` };
    if (c.kind !== "dinner" && c.kind !== "prep") return { ok: false, error: `Invalid kind "${String(c.kind)}".` };
    if (!intInRange(c.multiplier)) return { ok: false, error: "multiplier must be an integer 1-8." };
    if (c.day === "fri" && c.kind === "dinner") return { ok: false, error: "Friday dinner is pizza night — do not propose a Friday dinner." };
    proposals.push({
      recipeId: r.id,
      title: r.title,
      day: c.day,
      kind: c.kind,
      multiplier: c.multiplier as number,
      rationale: typeof c.rationale === "string" ? c.rationale : "",
    });
  }
  return { ok: true, value: { summary: obj.summary, proposals, coverage: estimateCoverage(ctx, proposals) } };
}

export type SwapOption = { recipeId: string; title: string; multiplier: number; rationale: string };
export type Swaps = { options: SwapOption[]; coverageNote?: string };

export function validateSwaps(input: unknown, ctx: PlanningContext): Validated<Swaps> {
  if (!input || typeof input !== "object") return { ok: false, error: "Malformed response." };
  const obj = input as { options?: unknown; coverage_note?: unknown };
  if (!Array.isArray(obj.options) || obj.options.length !== 3) return { ok: false, error: "Return exactly 3 options." };
  const options: SwapOption[] = [];
  for (const o of obj.options as Record<string, unknown>[]) {
    const r = typeof o.recipe_id === "string" ? ctx.libraryById.get(o.recipe_id) : undefined;
    if (!r) return { ok: false, error: `Unknown recipe_id "${String(o.recipe_id)}".` };
    if (!intInRange(o.multiplier)) return { ok: false, error: "multiplier must be an integer 1-8." };
    options.push({
      recipeId: r.id,
      title: r.title,
      multiplier: o.multiplier as number,
      rationale: typeof o.rationale === "string" ? o.rationale : "",
    });
  }
  return { ok: true, value: { options, coverageNote: typeof obj.coverage_note === "string" ? obj.coverage_note : undefined } };
}
