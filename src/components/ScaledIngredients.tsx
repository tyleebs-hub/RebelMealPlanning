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

function line(ing: Ingredient, mult: number): string {
  // Scale only when there's a parsed quantity; otherwise show the original line.
  if (ing.qty == null) return (ing.raw_text && ing.raw_text.trim()) || ing.item;
  return [fmtQty(ing.qty * mult), ing.unit ?? "", ing.item].filter(Boolean).join(" ").trim();
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
