import type { MealType, Recipe } from "@/lib/types";
import { displayedActiveMin, displayedTotalMin } from "@/lib/types";

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  drink: "Drink",
  dessert: "Dessert",
  side: "Side",
};

export function MealTypeChips({ types }: { types: MealType[] }) {
  if (!types || types.length === 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-400/60 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
        needs a label
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {types.map((t) => (
        <span
          key={t}
          className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
        >
          {MEAL_LABEL[t] ?? t}
        </span>
      ))}
    </div>
  );
}

export function TimeLine({ recipe }: { recipe: Recipe }) {
  const active = displayedActiveMin(recipe);
  const total = displayedTotalMin(recipe);
  if (active == null && total == null) return null;
  return (
    <p className="text-sm text-neutral-500 dark:text-neutral-400">
      {active != null && <span>{active} min active</span>}
      {active != null && total != null && <span aria-hidden> · </span>}
      {total != null && <span>{total} min total</span>}
    </p>
  );
}

export function RecipeBadges({ recipe }: { recipe: Recipe }) {
  const badges: { label: string; className: string }[] = [];
  if (recipe.is_component)
    badges.push({
      label: "Component",
      className:
        "border-violet-400/60 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
    });
  if (recipe.reheats_well)
    badges.push({
      label: "Reheats well",
      className:
        "border-emerald-400/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    });
  if (recipe.kids_like)
    badges.push({
      label: "Kids like",
      className:
        "border-sky-400/60 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
    });
  if (recipe.scales_cheaply)
    badges.push({
      label: "Scales cheaply",
      className:
        "border-neutral-300 bg-neutral-50 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400",
    });
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((b) => (
        <span
          key={b.label}
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${b.className}`}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}
