"use client";

import { useState } from "react";
import type { Ingredient } from "@/lib/types";

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]";

const FRACTIONS: [number, string][] = [
  [0.125, "⅛"], [0.25, "¼"], [0.333, "⅓"], [0.375, "⅜"], [0.5, "½"],
  [0.625, "⅝"], [0.667, "⅔"], [0.75, "¾"], [0.875, "⅞"],
];

// Cooking-friendly number: whole + common fraction, else a trimmed decimal.
function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return "";
  const whole = Math.floor(n + 1e-6);
  const frac = n - whole;
  for (const [v, s] of FRACTIONS) {
    if (Math.abs(frac - v) < 0.04) return whole > 0 ? `${whole}${s}` : s;
  }
  if (frac < 0.04) return String(whole);
  return String(Math.round(n * 100) / 100);
}

// A metric alt-measure written in parentheses, e.g. "(313g)" or "(360 ml)".
const METRIC_NUM =
  /\(\s*([\d.]+(?:\s+\d+\/\d+)?|\d+\s*\/\s*\d+)\s*(g|grams?|kg|kilograms?|ml|milliliters?|millilitres?|l|liters?|litres?)\b/i;
const METRIC_PAREN =
  /\(\s*[^)]*?\b[\d.]+\s*(?:g|grams?|kg|kilograms?|ml|milliliters?|millilitres?|l|liters?|litres?)\b[^)]*?\)/gi;

function parseNum(s: string): number | null {
  const t = s.trim();
  let m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return +m[1] + +m[2] / +m[3];
  m = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) return +m[1] / +m[2];
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

// Scale a metric alt-measure (grams/ml) from the original line so it tracks the
// primary amount, e.g. at x2 "(313g)" -> " (626g)".
function scaledMetric(ing: Ingredient, mult: number): string {
  const src = ing.raw_text && METRIC_NUM.test(ing.raw_text) ? ing.raw_text : ing.item;
  const m = src?.match(METRIC_NUM);
  if (!m) return "";
  const base = parseNum(m[1]);
  if (base == null) return "";
  const v = base * mult;
  const shown = Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
  return ` (${shown}${m[2]})`;
}

function line(ing: Ingredient, mult: number): string {
  // No parsed quantity: show the original line unchanged.
  if (ing.qty == null) return (ing.raw_text && ing.raw_text.trim()) || ing.item;
  // Strip any metric alt-measure from the item text; it's re-added, scaled, below.
  const item = (ing.item ?? "").replace(METRIC_PAREN, " ").replace(/\s{2,}/g, " ").trim();
  const primary = [fmtQty(ing.qty * mult), ing.unit ?? "", item].filter(Boolean).join(" ").trim();
  return primary + scaledMetric(ing, mult);
}

export function ScaledIngredients({
  ingredients,
  baseServings,
  initial = 1,
}: {
  ingredients: Ingredient[];
  baseServings?: number;
  initial?: number;
}) {
  const [mult, setMult] = useState(Math.max(1, Math.min(8, Math.round(initial))));
  const options = [...new Set([1, 2, 3, 4, mult])].sort((a, b) => a - b);

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={EYEBROW}>Scale</span>
        <div className="flex overflow-hidden rounded-lg border border-[var(--rule)]">
          {options.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setMult(n)}
              className="border-r border-[var(--rule)] px-2.5 py-1 text-sm last:border-r-0 transition-colors"
              style={n === mult ? { background: "var(--ink)", color: "var(--paper)" } : { color: "var(--ink2)" }}
            >
              ×{n}
            </button>
          ))}
        </div>
        {baseServings != null && (
          <span className="text-sm text-[var(--ink2)]">makes {baseServings * mult} servings</span>
        )}
      </div>

      <ul className="mt-3 flex flex-col">
        {ingredients.map((ing) => (
          <li key={ing.id} className="flex items-baseline gap-2 border-b border-[var(--rule2)] py-1.5 text-sm">
            <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--rule)" }} />
            <span>{line(ing, mult)}</span>
            {ing.is_pantry_staple && <span className="text-xs text-[var(--ink2)]">(staple)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
