// Cost model. See CLAUDE.md > Cost. Prices come from the ingredient_prices
// catalog keyed by normalizeKey(item, unit); recipe cost sums line costs.

import { DINNER_SERVINGS, LUNCH_SERVINGS } from "@/lib/types";
import { normalizeKey } from "@/lib/grocery";
import type { CookEvent, Slot } from "@/lib/week";

export type PriceMap = Map<string, number>; // item_key -> unit price

export type CostIngredient = { qty: number | null; unit: string | null; item: string };

export type RecipeCost = {
  cost: number; // base-batch cost from priced lines
  unpriced: number; // lines with a quantity but no price (would change the total)
  total: number; // total ingredient lines that carry a quantity
};

export function recipeCost(ings: CostIngredient[], prices: PriceMap): RecipeCost {
  let cost = 0;
  let unpriced = 0;
  let total = 0;
  for (const ing of ings) {
    const hasQty = ing.qty != null && ing.qty > 0;
    if (hasQty) total++;
    const p = prices.get(normalizeKey(ing.item, ing.unit ?? ""));
    if (p != null) cost += (ing.qty ?? 0) * p;
    else if (hasQty) unpriced++;
  }
  return { cost, unpriced, total };
}

export function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export type WeeklyCost = {
  total: number; // all cook-event cost this week
  dinner: number; // allocated to dinner slots
  lunch: number; // allocated to lunch slots
  unallocated: number; // cooked but not yet claimed by a slot
  unpricedCooks: number; // cook events whose recipe has unpriced ingredients
};

// Allocate each cook's cost across the slots it feeds. Cost/serving is fixed;
// a dinner slot consumes DINNER_SERVINGS, a lunch slot LUNCH_SERVINGS.
export function weeklyCost(
  cookEvents: CookEvent[],
  slots: Slot[],
  recipeCostById: Map<string, RecipeCost>,
): WeeklyCost {
  let total = 0;
  let dinner = 0;
  let lunch = 0;
  let unallocated = 0;
  let unpricedCooks = 0;

  for (const ce of cookEvents) {
    const rc = recipeCostById.get(ce.recipe_id);
    const cCost = (rc?.cost ?? 0) * ce.multiplier;
    const produced = ce.recipe.base_servings * ce.multiplier;
    const perServing = produced > 0 ? cCost / produced : 0;
    total += cCost;
    if (rc && rc.unpriced > 0) unpricedCooks++;

    let dinnerServings = 0;
    let lunchServings = 0;
    for (const s of slots) {
      if (s.cook_event_id !== ce.id) continue;
      if (s.meal === "dinner") dinnerServings += DINNER_SERVINGS;
      else lunchServings += LUNCH_SERVINGS;
    }
    // A dinner cook reserves a dinner's worth even before leftovers are assigned.
    if (ce.kind === "dinner" && dinnerServings === 0) dinnerServings = DINNER_SERVINGS;

    const consumed = Math.min(produced, dinnerServings + lunchServings);
    dinner += dinnerServings * perServing;
    lunch += lunchServings * perServing;
    unallocated += Math.max(0, produced - consumed) * perServing;
  }

  return { total, dinner, lunch, unallocated, unpricedCooks };
}
