"use client";

import { useMemo, useState, useTransition } from "react";
import {
  buildGroceryList,
  lineText,
  toPlainText,
  type GroceryIngredient,
} from "@/lib/grocery";
import { setGroceryCheck } from "@/app/week/[start]/grocery/actions";

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
}: {
  start: string;
  events: Event[];
  ingredientsByRecipe: Record<string, GroceryIngredient[]>;
  initialChecks: Record<string, boolean>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(events.map((e) => e.id)));
  const [checks, setChecks] = useState<Record<string, boolean>>(initialChecks);
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toPlainText(built));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const totalLines = built.groups.reduce((n, g) => n + g.lines.length, 0) + built.staples.length;

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

      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-neutral-500">{totalLines} items</span>
        <button
          onClick={copy}
          className="rounded-lg border border-neutral-300 px-2.5 py-1 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          {copied ? "Copied!" : "Copy as text"}
        </button>
      </div>

      {/* Aisles — flow into columns on wider screens so more fits without scrolling.
          Long aisles may span a column break; headers and individual items stay intact. */}
      <div className="mt-3 gap-x-10 sm:columns-2 lg:columns-3">
        {built.groups.map((g) => (
          <div key={g.aisle} className="mb-4">
            <h3 className="break-after-avoid text-xs font-semibold uppercase tracking-wide text-neutral-400">{g.aisle}</h3>
            <ul className="mt-1.5 flex flex-col">
              {g.lines.map((l) => (
                <li key={l.key} className="break-inside-avoid">
                  <label className="flex cursor-pointer items-center gap-2.5 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={!!checks[l.key]}
                      onChange={() => toggleCheck(l.key)}
                      className="h-4 w-4"
                    />
                    <span className={checks[l.key] ? "text-neutral-400 line-through" : ""}>
                      {lineText(l)}
                    </span>
                  </label>
                </li>
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
              <li key={l.key}>
                <label className="flex cursor-pointer items-center gap-2.5 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={!!checks[l.key]}
                    onChange={() => toggleCheck(l.key)}
                    className="h-4 w-4"
                  />
                  <span className={checks[l.key] ? "text-neutral-400 line-through" : ""}>
                    {lineText(l)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
