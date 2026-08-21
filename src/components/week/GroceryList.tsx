"use client";

import { useMemo, useState, useTransition } from "react";
import {
  buildGroceryList,
  lineText,
  toPlainText,
  type GroceryIngredient,
  type GroceryLine,
} from "@/lib/grocery";
import { money } from "@/lib/cost";
import { setGroceryCheck, setIngredientPrice } from "@/app/week/[start]/grocery/actions";

type Event = {
  id: string;
  recipe_id: string;
  multiplier: number;
  title: string;
  kind: string;
};

export function GroceryList({
  start,
  events,
  ingredientsByRecipe,
  initialChecks,
  initialPrices,
}: {
  start: string;
  events: Event[];
  ingredientsByRecipe: Record<string, GroceryIngredient[]>;
  initialChecks: Record<string, boolean>;
  initialPrices: Record<string, number>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(events.map((e) => e.id)));
  const [checks, setChecks] = useState<Record<string, boolean>>(initialChecks);
  const [prices, setPrices] = useState<Record<string, number>>(initialPrices);
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  const built = useMemo(
    () => buildGroceryList(events, ingredientsByRecipe, selected),
    [events, ingredientsByRecipe, selected],
  );

  const toggleEvent = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCheck = (key: string) => {
    const next = !checks[key];
    setChecks((prev) => ({ ...prev, [key]: next }));
    startTransition(() => setGroceryCheck(start, key, next));
  };

  const lineCost = (l: GroceryLine): number | null =>
    l.qty != null && prices[l.key] != null ? l.qty * prices[l.key] : null;

  // Commit a line's total cost; store the derived per-unit price in the catalog.
  const commitPrice = (l: GroceryLine, raw: string) => {
    if (l.qty == null || l.qty === 0) return;
    const cost = parseFloat(raw);
    if (!Number.isFinite(cost) || cost <= 0) {
      setPrices((p) => {
        const n = { ...p };
        delete n[l.key];
        return n;
      });
      startTransition(() => setIngredientPrice(start, l.key, l.item, l.unit, null));
    } else {
      const unit = cost / l.qty;
      setPrices((p) => ({ ...p, [l.key]: unit }));
      startTransition(() => setIngredientPrice(start, l.key, l.item, l.unit, unit));
    }
  };

  const allLines = [...built.groups.flatMap((g) => g.lines), ...built.staples];
  const total = allLines.reduce((s, l) => s + (lineCost(l) ?? 0), 0);
  const unpriced = allLines.filter((l) => l.qty != null && prices[l.key] == null).length;
  const totalLines = allLines.length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toPlainText(built));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const Row = ({ l }: { l: GroceryLine }) => (
    <li className="break-inside-avoid">
      <div className="flex items-center gap-2 py-1.5 text-sm">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={!!checks[l.key]}
            onChange={() => toggleCheck(l.key)}
            className="h-4 w-4 shrink-0"
          />
          <span className={checks[l.key] ? "text-neutral-400 line-through" : ""}>{lineText(l)}</span>
        </label>
        <PriceCell line={l} current={lineCost(l)} onCommit={commitPrice} />
      </div>
    </li>
  );

  return (
    <div className="mt-4">
      {/* Which cooks to shop for */}
      <div className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Shopping for</p>
        <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <label key={e.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(e.id)}
                onChange={() => toggleEvent(e.id)}
                className="h-4 w-4"
              />
              <span>
                {e.title} <span className="text-neutral-400">×{e.multiplier}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-neutral-500">
          {totalLines} items
          <span className="mx-1.5 text-neutral-300">·</span>
          <span className="font-medium text-[var(--ink)]">Est. {money(total)}</span>
          {unpriced > 0 && <span className="text-neutral-400"> · {unpriced} unpriced</span>}
        </span>
        <button
          onClick={copy}
          className="rounded-lg border border-neutral-300 px-2.5 py-1 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          {copied ? "Copied!" : "Copy as text"}
        </button>
      </div>

      {/* Aisles — flow into columns on wider screens so more fits without scrolling. */}
      <div className="mt-4 gap-x-10 [&>div]:pt-1 sm:columns-2 lg:columns-3">
        {built.groups.map((g) => (
          <div key={g.aisle} className="mb-4 break-inside-avoid-column">
            <h3 className="break-after-avoid text-xs font-semibold uppercase tracking-wide text-neutral-400">{g.aisle}</h3>
            <ul className="mt-1.5 flex flex-col">
              {g.lines.map((l) => (
                <Row key={l.key} l={l} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Pantry staples, collapsed */}
      {built.staples.length > 0 && (
        <details className="mt-5 rounded-lg border border-neutral-200 dark:border-neutral-800">
          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium">
            Pantry staples ({built.staples.length}) — probably have
          </summary>
          <ul className="flex flex-col border-t border-neutral-200 px-3 py-1.5 dark:border-neutral-800">
            {built.staples.map((l) => (
              <Row key={l.key} l={l} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function PriceCell({
  line,
  current,
  onCommit,
}: {
  line: GroceryLine;
  current: number | null;
  onCommit: (l: GroceryLine, raw: string) => void;
}) {
  const [v, setV] = useState(current != null ? current.toFixed(2) : "");
  // Keep in sync when the derived cost changes (e.g. multiplier/selection change).
  const shown = current != null ? current.toFixed(2) : "";
  const [focused, setFocused] = useState(false);

  if (line.qty == null || line.qty === 0) {
    return <span className="w-16 shrink-0" aria-hidden />;
  }

  return (
    <span className="flex w-16 shrink-0 items-center justify-end">
      <span className="text-xs text-neutral-400">$</span>
      <input
        value={focused ? v : shown}
        onFocus={() => {
          setV(current != null ? current.toFixed(2) : "");
          setFocused(true);
        }}
        onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ""))}
        onBlur={() => {
          setFocused(false);
          onCommit(line, v);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        inputMode="decimal"
        placeholder="—"
        aria-label={`Cost of ${lineText(line)}`}
        className="w-12 border-b border-dashed border-neutral-300 bg-transparent text-right text-xs tabular-nums focus:border-neutral-500 focus:outline-none dark:border-neutral-700"
      />
    </span>
  );
}
