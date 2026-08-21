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

type Built = { groups: GroceryGroup[]; staples: GroceryLine[] };

export function buildGroceryList(
  events: GroceryEvent[],
  ingredientsByRecipe: Record<string, GroceryIngredient[]>,
  selectedIds: Set<string>,
): Built {
  const acc = new Map<string, GroceryLine & { staple: boolean }>();

  for (const ev of events) {
    if (!selectedIds.has(ev.id)) continue;
    const ings = ingredientsByRecipe[ev.recipe_id] ?? [];
    for (const ing of ings) {
      const key = normalizeKey(ing.item, ing.unit);
      const scaled = ing.qty != null ? ing.qty * ev.multiplier : null;
      const existing = acc.get(key);
      if (existing) {
        if (scaled != null) existing.qty = (existing.qty ?? 0) + scaled;
        else existing.hasUnspecified = true;
      } else {
        acc.set(key, {
          key,
          item: ing.item.trim(),
          unit: ing.unit?.trim() || null,
          aisle: ing.aisle?.trim() || "Other",
          qty: scaled,
          hasUnspecified: scaled == null,
          staple: ing.is_pantry_staple,
        });
      }
    }
  }

  const all = [...acc.values()];
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
