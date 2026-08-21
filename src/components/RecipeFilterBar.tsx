"use client";

import {
  MEAL_TYPES,
  TIME_OPTIONS,
  filtersActive,
  type RecipeFilters,
} from "@/lib/recipe-filter";

// Shared filter controls for the recipe library and the slot picker.

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors"
      style={
        on
          ? { background: "var(--ink)", borderColor: "var(--ink)", color: "var(--paper)" }
          : { background: "var(--card)", borderColor: "var(--rule)", color: "var(--ink2)" }
      }
    >
      {children}
    </button>
  );
}

export function RecipeFilterBar({
  filters,
  onChange,
  showSearch = true,
  resultCount,
}: {
  filters: RecipeFilters;
  onChange: (f: RecipeFilters) => void;
  showSearch?: boolean;
  resultCount?: number;
}) {
  const set = (patch: Partial<RecipeFilters>) => onChange({ ...filters, ...patch });

  const toggleMeal = (m: (typeof MEAL_TYPES)[number]) =>
    set({
      meals: filters.meals.includes(m)
        ? filters.meals.filter((x) => x !== m)
        : [...filters.meals, m],
    });

  const active = filtersActive(filters);

  return (
    <div className="flex flex-col gap-2.5">
      {showSearch && (
        <input
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search recipes"
          className="w-full rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-sm"
        />
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {MEAL_TYPES.map((m) => (
          <Chip key={m} on={filters.meals.includes(m)} onClick={() => toggleMeal(m)}>
            {m}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {TIME_OPTIONS.map((t) => (
          <Chip
            key={t.value}
            on={filters.maxActive === t.value}
            onClick={() => set({ maxActive: filters.maxActive === t.value ? null : t.value })}
          >
            {t.label}
          </Chip>
        ))}
        <span className="mx-0.5 h-4 w-px bg-[var(--rule)]" aria-hidden />
        <Chip on={filters.kids} onClick={() => set({ kids: !filters.kids })}>
          Kid-friendly
        </Chip>
        <Chip on={filters.reheats} onClick={() => set({ reheats: !filters.reheats })}>
          Reheats well
        </Chip>
        {active && (
          <button
            type="button"
            onClick={() =>
              onChange({ q: "", meals: [], maxActive: null, kids: false, reheats: false })
            }
            className="ml-1 text-xs text-[var(--ink2)] underline underline-offset-2 hover:text-[var(--ink)]"
          >
            Clear
          </button>
        )}
        {typeof resultCount === "number" && (
          <span className="ml-auto font-mono text-[11px] text-[var(--ink2)]">
            {resultCount} {resultCount === 1 ? "match" : "matches"}
          </span>
        )}
      </div>
    </div>
  );
}
