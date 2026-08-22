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
        className="w-8 border-b border-dashed border-[var(--rule)] bg-transparent text-center tabular-nums text-[var(--ink2)] focus:border-[var(--ink2)] focus:outline-none"
      />
    </span>
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
  const left = budgets.dinner + budgets.lunch - cost.total;
  const over = left < 0;
  return (
    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
      <div className="flex items-baseline gap-2">
        <span className={EYEBROW}>Week total</span>
        <span className="font-mono text-lg font-medium tabular-nums">{money(cost.total)}</span>
        {cost.unpricedCooks > 0 && (
          <Link href={`/week/${start}/grocery`} className="font-mono text-[10px] text-[var(--ink2)] underline underline-offset-2 hover:text-[var(--ink)]">
            {cost.unpricedCooks} unpriced
          </Link>
        )}
      </div>
      <div className="flex items-baseline gap-1.5 font-mono text-xs">
        <span style={{ color: over ? "var(--clay-bg)" : "var(--go)" }}>
          {money(Math.abs(left))} {over ? "over" : "left"}
        </span>
        <span className="text-[var(--ink2)]">· budget</span>
        <BudgetInput start={start} which="dinner" value={budgets.dinner} />
        <span className="text-[var(--ink2)]">/</span>
        <BudgetInput start={start} which="lunch" value={budgets.lunch} />
      </div>
    </div>
  );
}
