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

// Flat cost for "out" slots (no recipe). Freeform label, matched loosely.
// Pizza night: Costco $12, Domino's $25, Champ's $50. Out to dinner $40, out to
// lunch $30. Leftovers / home lunches are free. Sourdough pizza is a real recipe,
// so it carries its own cook cost, not a flat out cost.
export function outCost(label: string | null, meal: "dinner" | "lunch" = "dinner"): number {
  if (!label) return 0;
  const s = label.toLowerCase();
  if (/leftover|sandwich|grab bag|home/.test(s)) return 0;
  if (/sourdough/.test(s)) return 0;
  if (/costco/.test(s)) return 12;
  if (/domino/.test(s)) return 25;
  if (/champ/.test(s)) return 50;
  if (/movie night|pizza night|\bpizza\b/.test(s)) return 12; // default pizza night = Costco
  if (/out to lunch/.test(s)) return 30;
  if (/out to dinner|restaurant|take-?out|dine out/.test(s)) return 40;
  if (/\bout\b|eat(ing)? out/.test(s)) return meal === "lunch" ? 30 : 40;
  return 0;
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

  // Out slots (Costco pizza, eating out) carry a flat cost, not a recipe cost.
  for (const s of slots) {
    if (s.fill_type !== "out") continue;
    const c = outCost(s.out_label, s.meal);
    if (c <= 0) continue;
    total += c;
    if (s.meal === "dinner") dinner += c;
    else lunch += c;
  }

  return { total, dinner, lunch, unallocated, unpricedCooks };
}
