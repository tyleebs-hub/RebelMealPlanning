import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadWeek } from "@/lib/week-data";
import { computeCoverage, type CookEvent, type Coverage, type Slot } from "@/lib/week";
import { recipeCost } from "@/lib/cost";
import { loadPrices } from "@/lib/cost-data";
import { loadHouseholdConfig } from "@/lib/household";
import type { HouseholdConfig, MealType } from "@/lib/types";

export type Protein = "chicken" | "beef" | "pork" | "turkey" | "fish" | "vegetarian" | "other";

// Broth/stock/sauce phrases that name a meat but aren't the dish's protein.
function stripFlavorings(t: string): string {
  return t
    .replace(/chicken (?:broth|stock|bouillon|base|granules|powder|seasoning)/g, " ")
    .replace(/beef (?:broth|stock|bouillon|base|granules)/g, " ")
    .replace(/(?:vegetable|veggie) (?:broth|stock)/g, " ")
    .replace(/fish sauce|oyster sauce|worcestershire/g, " ");
}
function detectProtein(text: string): Protein {
  const t = stripFlavorings(text.toLowerCase());
  if (/shrimp|salmon|tuna|\bcod\b|halibut|tilapia|\bfish\b|crab|scallop|seafood|prawn|anchov|sardine/.test(t)) return "fish";
  if (/chicken/.test(t)) return "chicken";
  if (/turkey/.test(t)) return "turkey";
  if (/\bbeef\b|steak|sirloin|ribeye|brisket|ground beef|meatloaf|corned beef|carne asada/.test(t)) return "beef";
  if (/\bpork\b|bacon|sausage|\bham\b|chorizo|prosciutto|pancetta|carnitas/.test(t)) return "pork";
  if (/tofu|tempeh|seitan|lentil|chickpea|garbanzo|\bbean\b|\bbeans\b|black bean|vegan|vegetarian|veggie|plant.?based|falafel|hummus|paneer|eggplant|mushroom|cauliflower|jackfruit|edamame/.test(t)) return "vegetarian";
  return "other";
}

// Protein of a dish from its title alone, so the planner can vary proteins.
export function proteinOf(title: string): Protein {
  return detectProtein(title);
}

// When the title is inconclusive, fall back to scanning the ingredient items.
export function proteinFor(title: string, ingredientItems: string[]): Protein {
  const byTitle = detectProtein(title);
  if (byTitle !== "other") return byTitle;
  return detectProtein(ingredientItems.join(" "));
}

export type PlanRecipe = {
  id: string;
  title: string;
  meal_types: MealType[];
  active_min: number | null;
  total_min: number | null;
  scales_cheaply: boolean;
  reheats_well: boolean;
  kids_like: boolean;
  is_component: boolean;
  base_servings: number;
  costPerServing: number | null;
  protein: Protein;
};

export type PlanningContext = {
  household: string;
  weekId: string;
  library: PlanRecipe[];
  libraryById: Map<string, PlanRecipe>;
  history: { week: string; titles: string[] }[];
  recentRecipeIds: Set<string>; // cooked in the last 2 weeks; do not re-propose
  cookEvents: CookEvent[];
  slots: Slot[];
  coverage: Coverage;
  cfg: HouseholdConfig;
};

// A recipe is plannable if it can serve as dinner, lunch, or a component batch.
function isPlannable(mt: MealType[], isComponent: boolean): boolean {
  return isComponent || mt.includes("dinner") || mt.includes("lunch");
}

export async function gatherPlanningContext(
  start: string,
  householdId: string,
): Promise<PlanningContext> {
  const sb = getSupabaseAdmin();
  const { weekId, cookEvents, slots } = await loadWeek(start, householdId);
  const cfg = await loadHouseholdConfig(householdId);

  const rows: Omit<PlanRecipe, "costPerServing">[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: recipeRows } = await sb
      .from("recipes")
      .select(
        "id,title,meal_types,active_min,total_min,scales_cheaply,reheats_well,kids_like,is_component,base_servings",
      )
      .eq("household_id", householdId)
      .order("title")
      .range(from, from + 999);
    const batch = (recipeRows ?? []) as Omit<PlanRecipe, "costPerServing">[];
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  const prices = await loadPrices(householdId);
  const plannable = rows.filter((r) => isPlannable(r.meal_types, r.is_component));

  // Cost per serving + protein for the plannable set (one ingredients query).
  const ids = plannable.map((r) => r.id);
  const costByRecipe = new Map<string, number | null>();
  const proteinByRecipe = new Map<string, Protein>();
  if (ids.length > 0) {
    const { data: ings } = await sb
      .from("ingredients")
      .select("recipe_id,qty,unit,item")
      .in("recipe_id", ids);
    const byRecipe = new Map<string, { qty: number | null; unit: string | null; item: string }[]>();
    for (const r of (ings ?? []) as { recipe_id: string; qty: number | null; unit: string | null; item: string }[]) {
      (byRecipe.get(r.recipe_id) ?? byRecipe.set(r.recipe_id, []).get(r.recipe_id)!).push(r);
    }
    for (const r of plannable) {
      const rows = byRecipe.get(r.id) ?? [];
      const rc = recipeCost(rows, prices);
      costByRecipe.set(r.id, rc.cost > 0 ? rc.cost / Math.max(1, r.base_servings) : null);
      proteinByRecipe.set(r.id, proteinFor(r.title, rows.map((x) => x.item)));
    }
  }

  const library: PlanRecipe[] = plannable.map((r) => ({
    ...r,
    costPerServing: costByRecipe.get(r.id) ?? null,
    protein: proteinByRecipe.get(r.id) ?? proteinOf(r.title),
  }));
  const libraryById = new Map(library.map((r) => [r.id, r]));

  // Last 3 weeks of this household's cook history. Titles feed the prompt; the
  // recipe ids from the 2 most recent weeks are excluded from candidates so the
  // planner never re-proposes something cooked recently.
  const { data: pastWeeks } = await sb
    .from("weeks")
    .select("id,start_date")
    .eq("household_id", householdId)
    .lt("start_date", start)
    .order("start_date", { ascending: false })
    .limit(3);
  const history: { week: string; titles: string[] }[] = [];
  const recentRecipeIds = new Set<string>();
  const weeksArr = (pastWeeks ?? []) as { id: string; start_date: string }[];
  for (let i = 0; i < weeksArr.length; i++) {
    const w = weeksArr[i];
    const { data: ces } = await sb
      .from("cook_events")
      .select("recipe_id,recipe:recipes(title)")
      .eq("week_id", w.id);
    const rows = (ces ?? []) as unknown as { recipe_id: string | null; recipe: { title: string } | null }[];
    const titles = [...new Set(rows.map((c) => c.recipe?.title).filter(Boolean) as string[])];
    if (titles.length) history.push({ week: w.start_date, titles });
    if (i < 2) for (const c of rows) if (c.recipe_id) recentRecipeIds.add(c.recipe_id);
  }

  return {
    weekId,
    library,
    libraryById,
    history,
    recentRecipeIds,
    cookEvents,
    slots,
    coverage: computeCoverage(slots, cfg),
    cfg,
    household: householdId,
  };
}

export function costTier(costPerServing: number | null): string {
  if (costPerServing == null) return "?";
  if (costPerServing < 2) return "$";
  if (costPerServing < 4) return "$$";
  return "$$$";
}

// The library can hold thousands of recipes; sending all of them to the model
// every call is slow and expensive and gains nothing (a week needs 5 dinners).
// Trim to a balanced, high-quality candidate set: the best N dinners per
// protein (so the model always has real variety to rotate through), plus a
// pool of reheatable/component recipes so it can still close the lunch gap.
// Deterministic so the cached prompt prefix stays stable across calls.
const DINNER_PER_PROTEIN = 40;
const EXTRA_LUNCH_CAP = 90;

function candidateScore(ctx: PlanningContext, r: PlanRecipe): number {
  return (
    (r.costPerServing != null ? 2 : 0) + // known cost beats a guess
    (r.reheats_well ? 2 : 0) + // can stretch into lunches
    (ctx.household === "leber" && r.kids_like ? 1 : 0) +
    (r.active_min != null && r.active_min <= 45 ? 1 : 0) // weeknight-friendly
  );
}

export function selectCandidates(ctx: PlanningContext, exclude?: Set<string>): PlanRecipe[] {
  const pool = ctx.library.filter((r) => !exclude?.has(r.id));
  const byScore = (a: PlanRecipe, b: PlanRecipe) =>
    candidateScore(ctx, b) - candidateScore(ctx, a) || a.title.localeCompare(b.title);

  const isDinner = (r: PlanRecipe) => r.meal_types.includes("dinner") || r.meal_types.length === 0;

  const buckets = new Map<Protein, PlanRecipe[]>();
  for (const r of pool) {
    if (!isDinner(r)) continue;
    (buckets.get(r.protein) ?? buckets.set(r.protein, []).get(r.protein)!).push(r);
  }

  const chosen = new Map<string, PlanRecipe>();
  for (const list of buckets.values()) {
    for (const r of list.sort(byScore).slice(0, DINNER_PER_PROTEIN)) chosen.set(r.id, r);
  }

  // Lunch machinery: components and reheatable lunch recipes not already picked.
  const extras = pool
    .filter((r) => !chosen.has(r.id) && (r.is_component || r.reheats_well || r.meal_types.includes("lunch")))
    .sort(byScore)
    .slice(0, EXTRA_LUNCH_CAP);
  for (const r of extras) chosen.set(r.id, r);

  return [...chosen.values()].sort((a, b) => a.title.localeCompare(b.title));
}
