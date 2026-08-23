"use client";

import { useMemo, useState, useTransition } from "react";
import { MultiplierStepper } from "./MultiplierStepper";
import { pickCook, assignLeftover, setOut, clearSlot, deleteCookEvent } from "@/app/week/[start]/actions";
import type { Hue } from "@/lib/hues";
import { RecipeFilterBar } from "@/components/RecipeFilterBar";
import { EMPTY_FILTERS, matchesFilters, type RecipeFilters } from "@/lib/recipe-filter";
import type { MealType } from "@/lib/types";

export type SlotView = {
  fill: "cook" | "leftover" | "out" | "empty";
  title?: string;
  hue?: Hue;
  multiplier?: number;
  produced?: number;
  cookEventId?: string;
  sauce?: string | null;
  fromDay?: string;
  short?: boolean;
  outLabel?: string;
};
export type DayView = { day: string; label: string; dateLabel: string; dinner: SlotView; lunch: SlotView };
export type PickerCook = { id: string; title: string; day: string; available: number; reheats: boolean; hue: Hue };
export type PickerRecipe = {
  id: string;
  title: string;
  meal_types: MealType[];
  isComponent: boolean;
  active_min: number | null;
  kids_like: boolean;
  reheats_well: boolean;
};

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]";
const DINNER_OUT = ["Costco pizza", "Domino's", "Champ's", "Out to dinner", "Leftovers"];
const LUNCH_OUT = ["Out to lunch", "Sandwiches", "Grab bag"];

export function WeekGrid({
  start,
  days,
  cooks,
  recipes,
  sauces,
}: {
  start: string;
  days: DayView[];
  cooks: PickerCook[];
  recipes: PickerRecipe[];
  sauces: string[];
}) {
  const [active, setActive] = useState<{ day: string; meal: "dinner" | "lunch" } | null>(null);

  return (
    <>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((d) => (
          <div key={d.day} className="rounded-xl border border-[var(--rule)] bg-[var(--card)] p-3">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-[15px]">{d.label}</span>
              <span className={`font-mono ${EYEBROW}`}>{d.dateLabel}</span>
            </div>
            <div className="mt-2.5 flex flex-col gap-2.5">
              <Slot start={start} day={d.day} meal="lunch" view={d.lunch} onOpen={() => setActive({ day: d.day, meal: "lunch" })} />
              <Slot start={start} day={d.day} meal="dinner" view={d.dinner} onOpen={() => setActive({ day: d.day, meal: "dinner" })} />
            </div>
          </div>
        ))}
      </div>

      {active && (
        <PickerSheet
          start={start}
          day={active.day}
          meal={active.meal}
          filled={
            (active.meal === "dinner"
              ? days.find((d) => d.day === active.day)?.dinner
              : days.find((d) => d.day === active.day)?.lunch)?.fill !== "empty"
          }
          cooks={cooks}
          recipes={recipes}
          sauces={sauces}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}

function Slot({
  start,
  day,
  meal,
  view,
  onOpen,
}: {
  start: string;
  day: string;
  meal: "dinner" | "lunch";
  view: SlotView;
  onOpen: () => void;
}) {
  const label = meal === "dinner" ? "Dinner" : "Lunch";
  // Fixed heights per meal so dinner rows and lunch rows align across all days.
  const H = meal === "dinner" ? "h-[168px]" : "h-[128px]";
  const [, startT] = useTransition();
  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Clearing a cook removes the cook event (and its dependent leftovers);
    // clearing a leftover/out just empties the slot.
    if (view.fill === "cook" && view.cookEventId) {
      startT(() => deleteCookEvent(start, view.cookEventId!));
    } else {
      startT(() => clearSlot(start, day as never, meal));
    }
  };

  if (view.fill === "empty") {
    return (
      <button
        onClick={onOpen}
        className={`flex ${H} w-full flex-col items-center justify-center rounded-lg border border-dashed border-[var(--rule)] text-sm font-medium text-[var(--ink2)] hover:border-[var(--ink2)] hover:text-[var(--ink)]`}
      >
        + {label}
      </button>
    );
  }

  if (view.fill === "out") {
    return (
      <div onClick={onOpen} className={`relative ${H} cursor-pointer overflow-hidden rounded-lg border border-dashed border-[var(--rule)] px-3 py-2`}>
        <div className={EYEBROW}>{label}</div>
        <div className="mt-1 line-clamp-3 text-sm text-[var(--ink2)]">{view.outLabel || "Out"}</div>
        <ClearBtn onClick={clear} />
      </div>
    );
  }

  if (view.fill === "leftover") {
    return (
      <div
        onClick={onOpen}
        className={`relative ${H} flex cursor-pointer flex-col overflow-hidden rounded-lg border border-[var(--rule)] px-3 py-2`}
        style={{ borderLeftColor: view.hue?.bg, borderLeftWidth: 4, background: view.hue?.soft }}
      >
        <div className={EYEBROW}>{label} · leftover</div>
        <div className="mt-0.5 line-clamp-2 text-sm font-semibold leading-tight">{view.title}</div>
        <div className="mt-auto line-clamp-2 font-mono text-[11px]" style={{ color: view.short ? "var(--clay-bg)" : view.hue?.text }}>
          {view.short ? "not enough cooked" : `from ${view.fromDay} · 2 portions${view.sauce ? ` · ${view.sauce}` : ""}`}
        </div>
        <ClearBtn onClick={clear} />
      </div>
    );
  }

  // cook
  return (
    <div
      onClick={onOpen}
      className={`relative ${H} flex cursor-pointer flex-col overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--card)] px-3 py-2`}
      style={{ borderLeftColor: view.hue?.bg, borderLeftWidth: 4 }}
    >
      <div className={EYEBROW}>{label} · cook</div>
      <div className="mt-0.5 line-clamp-2 text-sm font-semibold leading-tight">{view.title}</div>
      <div className="font-mono text-[11px]" style={{ color: view.hue?.text }}>{view.produced} servings</div>
      <div className="mt-auto pt-1" onClick={(e) => e.stopPropagation()}>
        {view.cookEventId && <MultiplierStepper start={start} cookEventId={view.cookEventId} value={view.multiplier ?? 1} />}
      </div>
      <ClearBtn onClick={clear} />
    </div>
  );
}

function ClearBtn({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Clear slot"
      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md text-[var(--ink2)] hover:bg-[var(--rule2)] hover:text-[var(--clay-bg)]"
    >
      ✕
    </button>
  );
}

function PickerSheet({
  start,
  day,
  meal,
  filled,
  cooks,
  recipes,
  sauces,
  onClose,
}: {
  start: string;
  day: string;
  meal: "dinner" | "lunch";
  filled: boolean;
  cooks: PickerCook[];
  recipes: PickerRecipe[];
  sauces: string[];
  onClose: () => void;
}) {
  // Opening +dinner / +lunch pre-selects that meal filter; the cook can widen it.
  const [filters, setFilters] = useState<RecipeFilters>({ ...EMPTY_FILTERS, meals: [meal] });
  const [sauce, setSauce] = useState("");
  const [, startT] = useTransition();

  const list = useMemo(
    () =>
      recipes.filter((r) => matchesFilters(r, filters, { untaggedAlways: true })).slice(0, 60),
    [recipes, filters],
  );

  const leftoverPool = cooks.filter((c) => c.available >= 2 && c.reheats);

  const doCook = (recipeId: string) => {
    startT(() => pickCook(start, day as never, meal, recipeId));
    onClose();
  };
  const doLeftover = (cookEventId: string) => {
    const fd = new FormData();
    fd.set("start", start);
    fd.set("day", day);
    fd.set("meal", meal);
    fd.set("cookEventId", cookEventId);
    if (meal === "lunch" && sauce) fd.set("sauce", sauce);
    startT(() => assignLeftover(fd));
    onClose();
  };
  const doOut = (labelText: string) => {
    const fd = new FormData();
    fd.set("start", start);
    fd.set("day", day);
    fd.set("meal", meal);
    fd.set("label", labelText);
    startT(() => setOut(fd));
    onClose();
  };
  const doClear = () => {
    startT(() => clearSlot(start, day as never, meal));
    onClose();
  };

  const btn = "rounded-lg border border-[var(--rule)] bg-[var(--card)] px-3 py-2 text-sm hover:border-[var(--ink2)]";

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(18,26,22,0.42)] p-0 backdrop-blur-[1px] sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-[var(--rule)] bg-[var(--card)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-[var(--rule)] bg-[var(--card)] px-4 py-3">
          <span className="font-display text-base capitalize">Fill {day} {meal}</span>
          <button onClick={onClose} className={`${btn} px-2 py-1`}>Close</button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          {meal === "lunch" && (
            <div>
              <div className={`${EYEBROW} mb-2`}>From what&apos;s already cooking</div>
              {leftoverPool.length === 0 ? (
                <p className="text-sm text-[var(--ink2)]">Nothing spare yet. Raise a dinner multiplier or cook a prep batch.</p>
              ) : (
                <>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs text-[var(--ink2)]">Sauce</span>
                    <select value={sauce} onChange={(e) => setSauce(e.target.value)} className="rounded-md border border-[var(--rule)] bg-[var(--paper)] px-2 py-1 text-sm">
                      <option value="">none</option>
                      {sauces.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    {leftoverPool.map((c) => (
                      <button key={c.id} onClick={() => doLeftover(c.id)} className="rounded-lg border border-[var(--rule)] px-3 py-2 text-left" style={{ borderLeftColor: c.hue.bg, borderLeftWidth: 4, background: c.hue.soft }}>
                        <div className="text-sm font-semibold">{c.title}</div>
                        <div className="font-mono text-[11px]" style={{ color: c.hue.text }}>{c.available} portions free</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div>
            <div className={`${EYEBROW} mb-2`}>No cook</div>
            <div className="flex flex-wrap gap-2">
              {(meal === "dinner" ? DINNER_OUT : LUNCH_OUT).map((x) => (
                <button key={x} onClick={() => doOut(x)} className={btn}>{x}</button>
              ))}
              {filled && <button onClick={doClear} className={`${btn} text-[var(--clay-bg)]`}>Clear slot</button>}
            </div>
          </div>

          <div>
            <div className={`${EYEBROW} mb-2`}>Cook a recipe</div>
            <div className="mb-3">
              <RecipeFilterBar filters={filters} onChange={setFilters} resultCount={list.length} />
            </div>
            <div className="flex flex-col gap-1.5">
              {list.map((r) => (
                <button key={r.id} onClick={() => doCook(r.id)} className="rounded-lg border border-[var(--rule)] px-3 py-2 text-left text-sm hover:border-[var(--ink2)]">
                  {r.title}
                  {r.meal_types.length === 0 && <span className="ml-1 text-xs text-[var(--ink2)]">(needs a label)</span>}
                  {r.isComponent && <span className="ml-1 text-xs text-[var(--ink2)]">· component</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
