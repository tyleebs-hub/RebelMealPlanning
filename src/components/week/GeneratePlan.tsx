"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dayLabel, type Day } from "@/lib/week";
import { generateWeek, acceptProposals } from "@/app/week/[start]/ai-actions";
import type { Proposal, WeekPlan } from "@/lib/ai/validate";

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]";

export function GeneratePlan({ start }: { start: string }) {
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startT] = useTransition();
  const router = useRouter();

  const generate = () => {
    setError(null);
    startT(async () => {
      const res = await generateWeek(start);
      if (res.ok) setPlan(res.plan);
      else setError(res.error);
    });
  };

  const accept = (proposals: Proposal[]) => {
    startT(async () => {
      await acceptProposals(start, proposals);
      setPlan((prev) => {
        if (!prev) return null;
        const takenKeys = new Set(proposals.map((p) => `${p.recipeId}|${p.day}|${p.kind}`));
        const rest = prev.proposals.filter((p) => !takenKeys.has(`${p.recipeId}|${p.day}|${p.kind}`));
        return rest.length ? { ...prev, proposals: rest } : null;
      });
      router.refresh();
    });
  };

  if (!plan) {
    return (
      <div>
        <button
          onClick={generate}
          disabled={pending}
          className="rounded-lg border border-[var(--rule)] bg-[var(--card)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--rule2)] disabled:opacity-50"
        >
          {pending ? "Thinking…" : "✨ Generate plan"}
        </button>
        {error && <p className="mt-1 text-xs text-[var(--clay-bg)]">{error}</p>}
      </div>
    );
  }

  return (
    <section className="mt-3 rounded-xl border px-4 py-3" style={{ borderColor: "var(--go)", background: "var(--go-soft, var(--rule2))" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={EYEBROW}>Proposed plan ✨</h2>
          <p className="mt-0.5 text-sm">{plan.summary}</p>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-[var(--ink2)]">
          {plan.coverage.dinnersFilled}/{plan.coverage.dinnerTarget} din · {plan.coverage.lunchPortions}/{plan.coverage.lunchTarget} lun
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {plan.proposals.map((p) => (
          <li key={`${p.recipeId}|${p.day}|${p.kind}`} className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-[var(--rule)] bg-[var(--card)]/60 px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink2)]">
                {dayLabel(p.day as Day)}{p.kind === "prep" ? " · prep" : ""}{p.multiplier > 1 ? ` · ×${p.multiplier}` : ""}
              </span>
              <span className="block truncate font-medium">{p.title}</span>
              {p.rationale && <span className="block truncate text-xs text-[var(--ink2)]">{p.rationale}</span>}
            </span>
            <button
              onClick={() => accept([p])}
              disabled={pending}
              className="shrink-0 rounded-md border border-[var(--rule)] px-2 py-1 text-xs hover:bg-[var(--rule2)] disabled:opacity-50"
            >
              Add
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => accept(plan.proposals)}
          disabled={pending}
          className="rounded-lg bg-[var(--go)] px-3 py-1.5 text-sm font-medium text-[var(--paper)] hover:opacity-90 disabled:opacity-50"
        >
          Accept all
        </button>
        <button onClick={generate} disabled={pending} className="rounded-lg border border-[var(--rule)] px-3 py-1.5 text-sm hover:bg-[var(--rule2)] disabled:opacity-50">
          {pending ? "…" : "Regenerate"}
        </button>
        <button onClick={() => setPlan(null)} disabled={pending} className="rounded-lg px-3 py-1.5 text-sm text-[var(--ink2)] hover:text-[var(--ink)]">
          Dismiss
        </button>
      </div>
    </section>
  );
}
