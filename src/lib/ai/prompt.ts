import { DAYS, dayLabel, type Day } from "@/lib/week";
import { DINNER_SERVINGS, LUNCH_SERVINGS, TARGET_DINNERS, TARGET_LUNCHES } from "@/lib/types";
import { costTier, type PlanningContext, type PlanRecipe } from "@/lib/ai/context";
import type { ToolDef } from "@/lib/ai/client";

export const SYSTEM = `You are the meal-planning assistant for the Leber family (Tyler, Charity, and 2 young kids) in Southwest Washington. You propose weekly dinner and lunch plans. You do not do arithmetic on portions or decide whether a week is "covered" — you propose recipes, day placements, and batch multipliers, and the app's ledger verifies coverage. Return your answer ONLY by calling the provided tool.

HOW THE LEDGER WORKS (for your intuition, not for you to compute exactly):
- A "cook" of a recipe at multiplier m produces base_servings * m servings.
- A dinner cook feeds the family that night (${DINNER_SERVINGS} servings reserved). Leftover servings become packed lunches (${LUNCH_SERVINGS} servings each = one lunch slot for the two adults).
- Only recipes flagged "reheats well" should feed lunches. Component batches (is_component) are lunch building blocks.
- Weekly targets: ${TARGET_DINNERS} dinners and ${TARGET_LUNCHES} lunches (=${TARGET_LUNCHES * LUNCH_SERVINGS} lunch portions). Close the lunch gap by raising a dinner's multiplier or adding a dedicated prep/component batch — never by proposing a recipe that doesn't reheat.

STANDING RULES:
- Friday dinner is pizza / movie night — leave Friday's dinner alone (do not propose a Friday dinner cook).
- At most 2 "ambitious" meals a week (long active time or lots of hands-on work). Everything else should be ~30 active minutes or less. Watch total active time across the whole week, not just per meal.
- Favor overlapping ingredients across cooks and stay budget-conscious (prefer $ and $$ over $$$ when it doesn't hurt variety).
- Avoid repeating recipes cooked in the last 3 weeks (history is provided).
- Favor kid-friendly options for dinners; respect recency and variety so it doesn't feel like the same week twice.

FAMILY FOOD RULES:
- Include: red meat, chicken, turkey, fish, shrimp, eggs; real cheese and butter; vegetables in sides/stir-fries/soups/mixed in; healthy fats; mostly whole foods; frozen pre-chopped veg is fine.
- Onions are loved (especially grilled) but grilling is slow, so not every week.
- HARD EXCLUDES (never propose): large salads as a main, Greek yogurt, cottage cheese, ghee, heavily processed convenience food.
- Only propose recipes from the provided library, by their exact id. Never invent recipes.`;

// Compact one-line-per-recipe library — the cached prefix.
function libraryLine(r: PlanRecipe): string {
  const flags = [
    r.reheats_well ? "reheats" : "",
    r.kids_like ? "kids" : "",
    r.is_component ? "component" : "",
    r.scales_cheaply ? "" : "no-cheap-scale",
  ].filter(Boolean).join(",");
  const time = `${r.active_min ?? "?"}a/${r.total_min ?? "?"}t min`;
  return `${r.id} | ${r.title} | [${r.meal_types.join(",")}] | ${time} | serves ${r.base_servings} | ${flags || "-"} | ${costTier(r.costPerServing)}`;
}

export function formatLibrary(ctx: PlanningContext): string {
  return `RECIPE LIBRARY (id | title | meal types | active/total time | base servings | flags | cost tier per serving):\n${ctx.library
    .map(libraryLine)
    .join("\n")}`;
}

function filledDinnerDays(ctx: PlanningContext): Set<Day> {
  const byKey = new Map(ctx.slots.map((s) => [`${s.day}|${s.meal}`, s]));
  const set = new Set<Day>();
  for (const d of DAYS) {
    const s = byKey.get(`${d}|dinner`);
    if (s?.fill_type) set.add(d);
  }
  return set;
}

function lockedCooksText(ctx: PlanningContext): string {
  if (ctx.cookEvents.length === 0) return "None yet.";
  return ctx.cookEvents
    .map((c) => `- ${c.recipe.title} x${c.multiplier} on ${c.day ? dayLabel(c.day) : "(no day)"} (${c.kind})`)
    .join("\n");
}

function historyText(ctx: PlanningContext): string {
  if (ctx.history.length === 0) return "No recent history.";
  return ctx.history.map((h) => `- week of ${h.week}: ${h.titles.join(", ")}`).join("\n");
}

export function formatGenerateUser(ctx: PlanningContext): string {
  const filled = filledDinnerDays(ctx);
  const empty = DAYS.filter((d) => d !== "fri" && !filled.has(d));
  return `TASK: Propose a plan to fill the empty DINNER slots and close the lunch-portion gap.

CURRENT WEEK:
- Dinners filled: ${ctx.coverage.dinnersFilled}/${ctx.coverage.dinnerTarget}
- Lunch portions covered: ${ctx.coverage.lunchPortions}/${ctx.coverage.lunchTarget}
- Empty dinner days you may fill (Friday is excluded — pizza night): ${empty.map(dayLabel).join(", ") || "none"}
- Existing cooks (LOCKED — do not replace, plan around them):
${lockedCooksText(ctx)}

RECENT HISTORY (avoid repeating these):
${historyText(ctx)}

Propose cooks (recipe_id + day + kind + multiplier + one-line rationale each) so that dinners reach ${TARGET_DINNERS} and lunch portions reach ${TARGET_LUNCHES * LUNCH_SERVINGS}. Use kind "dinner" for a meal cooked that night; use kind "prep" for a component/batch cooked to feed lunches only (no day needed, but pick a day for grocery/prep planning). Raise multipliers or add a prep batch to cover lunches. Also write a short 1-2 sentence summary for the top of the week view.`;
}

export function formatSwapUser(
  ctx: PlanningContext,
  day: Day,
  meal: "dinner" | "lunch",
  currentTitle: string | null,
  lunchesFed: number,
  reason?: string,
): string {
  const coverageHole =
    meal === "dinner" && lunchesFed > 0
      ? `This dinner currently feeds ${lunchesFed} packed lunch(es). Replacements must be able to feed the same number of lunches (reheats-well, raise the multiplier) or note the gap.`
      : "This slot carries no lunch portions.";
  return `TASK: Charity said no to the ${meal} on ${dayLabel(day)}${currentTitle ? ` ("${currentTitle}")` : ""}. Propose exactly 3 alternative recipes for THIS one slot.${reason ? `\nHer reason: "${reason}"` : ""}

${coverageHole}

The rest of the week is LOCKED (plan around it):
${lockedCooksText(ctx)}

RECENT HISTORY (avoid repeating):
${historyText(ctx)}

Return exactly 3 DIFFERENT options (never re-propose the current dish${currentTitle ? ` "${currentTitle}"` : ""}, and don't repeat a recipe already locked in this week), each a recipe_id + multiplier + one short line on why it fits. If none can hold the lunch coverage, still return 3 good ${meal} options and set coverage_note to explain the lunch gap.`;
}

// ---- chat -------------------------------------------------------------------

export const CHAT_SYSTEM = `You are a warm, practical meal-planning helper for the Leber family (Tyler, Charity, 2 young kids) in Southwest Washington. You brainstorm dinners and lunches for THIS week's open slots.

Be concise and concrete. When Tyler mentions ingredients (often on sale), suggest a few specific ways to use them across the open slots — point to existing recipes in the library by exact title when one fits, or propose a simple new dish that suits their tastes. For each idea, say which open day/slot it could fill and whether it reheats for packed lunches. Prefer batch-cook ideas that stretch into lunches when there's a lunch gap. Keep answers short — a few tight bullets, not essays.

Respect the family rules:
- Include: red meat, chicken, turkey, fish, shrimp, eggs; real cheese and butter; veg in sides/stir-fries/soups; healthy fats; mostly whole foods; frozen pre-chopped veg is fine.
- Friday dinner is pizza / movie night — don't plan a Friday dinner.
- HARD EXCLUDES: large salads as a main, Greek yogurt, cottage cheese, ghee, heavily processed convenience food.
- Weekly targets: ${TARGET_DINNERS} dinners, ${TARGET_LUNCHES * LUNCH_SERVINGS} lunch portions. Only recipes that reheat well should feed lunches.

When you propose specific dinners or lunches Tyler could drop into an open slot, ALSO call the suggest_meals tool with them as structured actions — each with a day (an OPEN slot, never Friday dinner), a meal, and either the exact library recipe_id (if it's an existing recipe) or, for a NEW dish, a short ingredients list, a few steps, and whether it reheats_well. Keep your text reply conversational and readable; the tool is only for the "Add" buttons, so don't describe the tool. Only include meals you'd genuinely recommend — it's fine to call it with fewer meals than you discuss, or not at all for a general question.`;

export function formatWeekOpenings(ctx: PlanningContext): string {
  const byKey = new Map(ctx.slots.map((s) => [`${s.day}|${s.meal}`, s]));
  const emptyDinners = DAYS.filter((d) => d !== "fri" && !byKey.get(`${d}|dinner`)?.fill_type).map(dayLabel);
  const emptyLunches = DAYS.filter((d) => !byKey.get(`${d}|lunch`)?.fill_type).map(dayLabel);
  return `THIS WEEK'S STATE:
- Coverage: ${ctx.coverage.dinnersFilled}/${ctx.coverage.dinnerTarget} dinners, ${ctx.coverage.lunchPortions}/${ctx.coverage.lunchTarget} lunch portions.
- Open dinner slots (Friday excluded — pizza night): ${emptyDinners.join(", ") || "none"}
- Open lunch slots: ${emptyLunches.join(", ") || "none"}
- Already planned (leave these be):
${lockedCooksText(ctx)}`;
}

// ---- tool schemas -----------------------------------------------------------

export const PROPOSE_WEEK_TOOL: ToolDef = {
  name: "propose_week_plan",
  description: "Return the proposed week plan as structured cooks plus a short summary.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "cooks"],
    properties: {
      summary: { type: "string", description: "1-2 sentence summary for the top of the week view." },
      cooks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["recipe_id", "day", "kind", "multiplier", "rationale"],
          properties: {
            recipe_id: { type: "string", description: "Exact recipe id from the library." },
            day: { type: "string", enum: [...DAYS] },
            kind: { type: "string", enum: ["dinner", "prep"] },
            multiplier: { type: "integer", description: "Batch multiplier, 1-8." },
            rationale: { type: "string", description: "One short line." },
          },
        },
      },
    },
  },
};

export const SUGGEST_MEALS_TOOL: ToolDef = {
  name: "suggest_meals",
  description: "Surface the specific meals you're recommending as add-to-week actions.",
  input_schema: {
    type: "object",
    required: ["meals"],
    properties: {
      meals: {
        type: "array",
        items: {
          type: "object",
          required: ["title", "day", "meal"],
          properties: {
            title: { type: "string" },
            recipe_id: { type: "string", description: "Exact library id, if this is an existing recipe." },
            day: { type: "string", enum: [...DAYS] },
            meal: { type: "string", enum: ["dinner", "lunch"] },
            multiplier: { type: "integer", description: "Batch multiplier 1-8 (default 1)." },
            reheats_well: { type: "boolean", description: "For a new dish: does it reheat for lunches?" },
            ingredients: { type: "array", items: { type: "string" }, description: "New dish only: one ingredient per item." },
            steps: { type: "array", items: { type: "string" }, description: "New dish only: brief steps." },
          },
        },
      },
    },
  },
};

export const PROPOSE_SWAPS_TOOL: ToolDef = {
  name: "propose_swaps",
  description: "Return exactly 3 alternative recipes for one slot.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["options"],
    properties: {
      options: {
        type: "array",
        description: "Exactly 3 options.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["recipe_id", "multiplier", "rationale"],
          properties: {
            recipe_id: { type: "string" },
            multiplier: { type: "integer", description: "Batch multiplier, 1-8." },
            rationale: { type: "string" },
          },
        },
      },
      coverage_note: { type: "string", description: "Only if the lunch coverage can't be held." },
    },
  },
};
