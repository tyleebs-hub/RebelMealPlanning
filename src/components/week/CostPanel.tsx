"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { money, type WeeklyCost } from "@/lib/cost";
import { setBudget } from "@/app/week/[start]/actions";

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]";

function BudgetInput({
  start,
  which,
  value,
}: {
  start: string;
  which: "dinner" | "lunch";
  value: number;
}) {
  const [v, setV] = useState(String(value));
  const [, startT] = useTransition();
  const commit = () => {
    const n = Math.max(0, Math.round(Number(v) || 0));
    setV(String(n));
    if (n !== value) startT(() => setBudget(start, which, n));
  };
  return (
    <span className="inline-flex items-baseline">
      <span className="text-[var(--ink2)]">$</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        inputMode="numeric"
        aria-label={`${which} weekly budget`}
        className="w-10 border-b border-dashed border-[var(--rule)] bg-transparent text-center font-mono text-xs text-[var(--ink2)] focus:border-[var(--ink2)] focus:outline-none"
      />
    </span>
  );
}

function Meter({
  label,
  spend,
  budget,
  color,
  start,
  which,
}: {
  label: string;
  spend: number;
  budget: number;
  color: string;
  start: string;
  which: "dinner" | "lunch";
}) {
  const over = budget > 0 && spend > budget;
  const pct = budget > 0 ? Math.min(100, Math.round((spend / budget) * 100)) : 0;
  const barColor = over ? "var(--clay-bg)" : color;
  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className={EYEBROW}>{label}</span>
        <span className="font-mono text-xs">
          <span style={{ color: over ? "var(--clay-bg)" : "var(--ink)" }}>{money(spend)}</span>
          <span className="text-[var(--ink2)]"> / </span>
          <BudgetInput start={start} which={which} value={budget} />
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--rule2)]">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
    </div>
  );
}

export function CostPanel({
  start,
  cost,
  budgets,
}: {
  start: string;
  cost: WeeklyCost;
  budgets: { dinner: number; lunch: number };
}) {
  return (
    <div className="rounded-xl border border-[var(--rule)] bg-[var(--card)] p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
        <Meter label="Dinner spend" spend={cost.dinner} budget={budgets.dinner} color="var(--go)" start={start} which="dinner" />
        <Meter label="Lunch spend" spend={cost.lunch} budget={budgets.lunch} color="var(--amber)" start={start} which="lunch" />
        <div className="sm:w-36">
          <span className={EYEBROW}>Week total</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-medium tabular-nums">{money(cost.total)}</span>
          </div>
          {cost.unallocated > 0.005 && (
            <span className="text-xs text-[var(--ink2)]">{money(cost.unallocated)} not yet claimed</span>
          )}
        </div>
      </div>

      {cost.unpricedCooks > 0 && (
        <div className="mt-3 flex items-start gap-2 border-t border-[var(--rule2)] pt-3 text-sm text-[var(--ink2)]">
          <span aria-hidden style={{ color: "var(--amber)" }}>→</span>
          <span>
            {cost.unpricedCooks} {cost.unpricedCooks === 1 ? "cook has" : "cooks have"} unpriced ingredients — add prices on the{" "}
            <Link href={`/week/${start}/grocery`} className="underline underline-offset-2 hover:text-[var(--ink)]">grocery list</Link>{" "}
            to sharpen this.
          </span>
        </div>
      )}
    </div>
  );
}
