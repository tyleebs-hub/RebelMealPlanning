"use client";

import { useState, useTransition } from "react";
import type { HouseholdConfig } from "@/lib/types";
import { setHouseholdConfig } from "@/app/week/[start]/actions";

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]";

function Field({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm">
        {label}
        <span className="ml-1.5 text-[var(--ink2)]">{hint}</span>
      </span>
      <input
        type="number"
        min={1}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-2 py-1 text-right text-sm tabular-nums"
      />
    </label>
  );
}

export function HouseholdSettings({ start, initial }: { start: string; initial: HouseholdConfig }) {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const dirty =
    cfg.dinnerServings !== initial.dinnerServings ||
    cfg.lunchServings !== initial.lunchServings ||
    cfg.targetDinners !== initial.targetDinners ||
    cfg.targetLunches !== initial.targetLunches;

  const save = () => {
    startTransition(async () => {
      await setHouseholdConfig(start, cfg);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  return (
    <div className="mt-2 px-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[var(--ink2)] transition-colors hover:text-[var(--ink)]"
      >
        <span className={EYEBROW}>Servings &amp; targets</span>
        <span aria-hidden className="text-xs">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-2 max-w-sm rounded-xl border border-[var(--rule)] bg-[var(--card)] p-4">
          <p className="text-xs text-[var(--ink2)]">
            How many this household cooks for. Raising a dinner&apos;s multiplier fills lunches from the leftovers.
          </p>
          <div className="mt-2 divide-y divide-[var(--rule2)]">
            <Field label="Dinner" hint="servings per night" value={cfg.dinnerServings} onChange={(n) => setCfg({ ...cfg, dinnerServings: n })} />
            <Field label="Lunch" hint="servings per slot" value={cfg.lunchServings} onChange={(n) => setCfg({ ...cfg, lunchServings: n })} />
            <Field label="Dinners" hint="target per week" value={cfg.targetDinners} onChange={(n) => setCfg({ ...cfg, targetDinners: n })} />
            <Field label="Lunches" hint="target per week" value={cfg.targetLunches} onChange={(n) => setCfg({ ...cfg, targetLunches: n })} />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || pending}
              className="rounded-lg bg-[var(--ink)] px-3 py-1.5 text-sm font-medium text-[var(--paper)] disabled:opacity-40"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            {saved && <span className="text-xs text-[var(--go)]">Saved</span>}
          </div>
        </div>
      )}
    </div>
  );
}
