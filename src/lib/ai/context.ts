import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadWeek } from "@/lib/week-data";
import { computeCoverage, type CookEvent, type Coverage, type Slot } from "@/lib/week";
import { recipeCost } from "@/lib/cost";
import { loadPrices } from "@/lib/cost-data";
import type { MealType } from "@/lib/types";

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
};

export type PlanningContext = {
  weekId: string;
  library: PlanRecipe[];
  libraryById: Map<string, PlanRecipe>;
  history: { week: string; titles: string[] }[];
  cookEvents: CookEvent[];
  slots: Slot[];
  coverage: Coverage;
};

// A recipe is plannable if it can serve as dinner, lunch, or a component batch.
function isPlannable(mt: MealType[], isComponent: boolean): boolean {
  return isComponent || mt.includes("dinner") || mt.includes("lunch");
}

export async function gatherPlanningContext(start: string): Promise<PlanningContext> {
  const sb = getSupabaseAdmin();
  const { weekId, cookEvents, slots } = await loadWeek(start);

  const [{ data: recipeRows }, prices] = await Promise.all([
    sb
      .from("recipes")
      .select(
        "id,title,meal_types,active_min,total_min,scales_cheaply,reheats_well,kids_like,is_component,base_servings",
      )
      .order("title"),
    loadPrices(),
  ]);

  const rows = (recipeRows ?? []) as Omit<PlanRecipe, "costPerServing">[];
  const plannable = rows.filter((r) => isPlannable(r.meal_types, r.is_component));

  // Cost per serving for the plannable set (one ingredients query).
  const ids = plannable.map((r) => r.id);
  const costByRecipe = new Map<string, number | null>();
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
      const rc = recipeCost(byRecipe.get(r.id) ?? [], prices);
      costByRecipe.set(r.id, rc.cost > 0 ? rc.cost / Math.max(1, r.base_servings) : null);
    }
  }

  const library: PlanRecipe[] = plannable.map((r) => ({
    ...r,
    costPerServing: costByRecipe.get(r.id) ?? null,
  }));
  const libraryById = new Map(library.map((r) => [r.id, r]));

  // Last 3 weeks of cook history (titles only, to avoid repeats).
  const { data: pastWeeks } = await sb
    .from("weeks")
    .select("id,start_date")
    .lt("start_date", start)
    .order("start_date", { ascending: false })
    .limit(3);
  const history: { week: string; titles: string[] }[] = [];
  for (const w of (pastWeeks ?? []) as { id: string; start_date: string }[]) {
    const { data: ces } = await sb
      .from("cook_events")
      .select("recipe:recipes(title)")
      .eq("week_id", w.id);
    const titles = [
      ...new Set(
        ((ces ?? []) as unknown as { recipe: { title: string } | null }[])
          .map((c) => c.recipe?.title)
          .filter(Boolean) as string[],
      ),
    ];
    if (titles.length) history.push({ week: w.start_date, titles });
  }

  return {
    weekId,
    library,
    libraryById,
    history,
    cookEvents,
    slots,
    coverage: computeCoverage(slots),
  };
}

export function costTier(costPerServing: number | null): string {
  if (costPerServing == null) return "?";
  if (costPerServing < 2) return "$";
  if (costPerServing < 4) return "$$";
  return "$$$";
}
