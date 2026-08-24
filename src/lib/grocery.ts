// Grocery list generation. See CLAUDE.md > Grocery list.
// Merge ingredients across selected cook events by item|unit, scaling each by
// its cook event's multiplier. Group by aisle; pantry staples separate.

export type GroceryIngredient = {
  recipe_id: string;
  qty: number | null;
  unit: string | null;
  item: string;
  aisle: string | null;
  is_pantry_staple: boolean;
};

export type GroceryEvent = { id: string; recipe_id: string; multiplier: number };

export type GroceryLine = {
  key: string; // item|unit, normalized
  item: string;
  unit: string | null;
  aisle: string;
  qty: number | null; // summed known quantity (null if nothing was parseable)
  hasUnspecified: boolean; // some contributing lines had no quantity
};

export type GroceryGroup = { aisle: string; lines: GroceryLine[] };

export const AISLE_ORDER = ["Produce", "Meat", "Dairy", "Bakery", "Frozen", "Pantry", "Other"];

export function normalizeKey(item: string, unit: string | null): string {
  return `${item.trim().toLowerCase()}|${(unit ?? "").trim().toLowerCase()}`;
}

export function formatQty(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
}

// Cross-unit aggregation: same item, compatible units combine. Volume units all
// convert to cups; weight units to ounces. Count/each units (clove, can, "") only
// merge when identical. Lax by design — unknown units stay their own line.
const VOL_TO_CUPS: Record<string, number> = {
  tsp: 1 / 48, teaspoon: 1 / 48, teaspoons: 1 / 48,
  tbsp: 1 / 16, tbs: 1 / 16, tablespoon: 1 / 16, tablespoons: 1 / 16,
  cup: 1, cups: 1,
  "fl oz": 1 / 8, "fluid ounce": 1 / 8, "fluid ounces": 1 / 8,
  pint: 2, pints: 2, quart: 4, quarts: 4,
  ml: 0.00422675, milliliter: 0.00422675, milliliters: 0.00422675,
  l: 4.22675, liter: 4.22675, liters: 4.22675,
};
const WT_TO_OZ: Record<string, number> = {
  oz: 1, ounce: 1, ounces: 1,
  lb: 16, lbs: 16, pound: 16, pounds: 16,
  g: 0.035274, gram: 0.035274, grams: 0.035274,
  kg: 35.274, kilogram: 35.274, kilograms: 35.274,
};
function unitConversion(unit: string | null): { cat: "vol" | "wt"; factor: number } | null {
  if (!unit) return null;
  const u = unit.toLowerCase();
  if (u in VOL_TO_CUPS) return { cat: "vol", factor: VOL_TO_CUPS[u] };
  if (u in WT_TO_OZ) return { cat: "wt", factor: WT_TO_OZ[u] };
  return null;
}
const round2 = (n: number) => Math.round(n * 100) / 100;
function fmtVolume(cups: number): { qty: number; unit: string } {
  const tbsp = cups * 16;
  if (cups >= 0.75) return { qty: round2(cups), unit: "cups" };
  if (tbsp >= 1) return { qty: round2(tbsp), unit: "tbsp" };
  return { qty: round2(tbsp * 3), unit: "tsp" };
}
function fmtWeight(oz: number): { qty: number; unit: string } {
  if (oz >= 16) return { qty: round2(oz / 16), unit: "lb" };
  return { qty: round2(oz), unit: "oz" };
}

type Built = { groups: GroceryGroup[]; staples: GroceryLine[] };

export function buildGroceryList(
  events: GroceryEvent[],
  ingredientsByRecipe: Record<string, GroceryIngredient[]>,
  selectedIds: Set<string>,
): Built {
  type Acc = {
    key: string; item: string; aisle: string; staple: boolean;
    cat: "vol" | "wt" | "raw"; unit: string | null;
    cups: number; oz: number; qty: number | null; hasUnspecified: boolean;
  };
  const acc = new Map<string, Acc>();

  for (const ev of events) {
    if (!selectedIds.has(ev.id)) continue;
    for (const ing of ingredientsByRecipe[ev.recipe_id] ?? []) {
      const item = ing.item.trim();
      const unit = ing.unit?.trim() || null;
      const scaled = ing.qty != null ? ing.qty * ev.multiplier : null;
      const conv = unitConversion(unit);
      const mergeKey = conv ? `${item.toLowerCase()}|__${conv.cat}` : normalizeKey(item, unit);
      let e = acc.get(mergeKey);
      if (!e) {
        e = {
          key: mergeKey, item, aisle: ing.aisle?.trim() || "Other", staple: ing.is_pantry_staple,
          cat: conv?.cat ?? "raw", unit: conv ? null : unit, cups: 0, oz: 0, qty: null, hasUnspecified: false,
        };
        acc.set(mergeKey, e);
      }
      if (scaled == null) { e.hasUnspecified = true; continue; }
      if (conv?.cat === "vol") e.cups += scaled * conv.factor;
      else if (conv?.cat === "wt") e.oz += scaled * conv.factor;
      else e.qty = (e.qty ?? 0) + scaled;
    }
  }

  const finalize = (e: Acc): GroceryLine & { staple: boolean } => {
    let qty: number | null;
    let unit: string | null;
    let key: string;
    if (e.cat === "vol") {
      const f = fmtVolume(e.cups);
      qty = e.cups > 0 ? f.qty : null;
      unit = f.unit;
      key = normalizeKey(e.item, unit);
    } else if (e.cat === "wt") {
      const f = fmtWeight(e.oz);
      qty = e.oz > 0 ? f.qty : null;
      unit = f.unit;
      key = normalizeKey(e.item, unit);
    } else {
      qty = e.qty;
      unit = e.unit;
      key = e.key;
    }
    return { key, item: e.item, unit, aisle: e.aisle, qty, hasUnspecified: e.hasUnspecified, staple: e.staple };
  };

  const all = [...acc.values()].map(finalize);
  const staples = all.filter((l) => l.staple).sort((a, b) => a.item.localeCompare(b.item));
  const rest = all.filter((l) => !l.staple);

  const byAisle = new Map<string, GroceryLine[]>();
  for (const l of rest) {
    const arr = byAisle.get(l.aisle) ?? [];
    arr.push(l);
    byAisle.set(l.aisle, arr);
  }

  const groups: GroceryGroup[] = [];
  const seen = new Set<string>();
  for (const aisle of AISLE_ORDER) {
    const lines = byAisle.get(aisle);
    if (lines && lines.length) {
      groups.push({ aisle, lines: lines.sort((a, b) => a.item.localeCompare(b.item)) });
      seen.add(aisle);
    }
  }
  // any aisle not in the canonical order
  for (const [aisle, lines] of byAisle) {
    if (!seen.has(aisle)) {
      groups.push({ aisle, lines: lines.sort((a, b) => a.item.localeCompare(b.item)) });
    }
  }

  return { groups, staples };
}

export function lineText(l: GroceryLine): string {
  const qtyPart = l.qty != null ? `${formatQty(l.qty)}${l.unit ? " " + l.unit : ""} ` : "";
  const more = l.hasUnspecified && l.qty != null ? " (+ more)" : "";
  return `${qtyPart}${l.item}${more}`;
}

export function toPlainText(built: Built): string {
  const out: string[] = [];
  for (const g of built.groups) {
    out.push(g.aisle.toUpperCase());
    for (const l of g.lines) out.push(`  - ${lineText(l)}`);
    out.push("");
  }
  if (built.staples.length) {
    out.push("PANTRY STAPLES (probably have)");
    for (const l of built.staples) out.push(`  - ${lineText(l)}`);
  }
  return out.join("\n").trim();
}
