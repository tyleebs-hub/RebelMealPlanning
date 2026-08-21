import type { MealType } from "@/lib/types";

// Shared recipe filtering for the library and the slot picker.

export type FilterableRecipe = {
  title: string;
  meal_types: MealType[];
  active_min: number | null;
  kids_like: boolean;
  reheats_well: boolean;
};

export type RecipeFilters = {
  q: string;
  meals: MealType[]; // empty = any
  maxActive: number | null; // null = any
  kids: boolean;
  reheats: boolean;
};

export const EMPTY_FILTERS: RecipeFilters = {
  q: "",
  meals: [],
  maxActive: null,
  kids: false,
  reheats: false,
};

export const MEAL_TYPES: MealType[] = [
  "breakfast", "lunch", "dinner", "snack", "drink", "dessert", "side",
];

export const TIME_OPTIONS: { label: string; value: number }[] = [
  { label: "≤ 15 min", value: 15 },
  { label: "≤ 30 min", value: 30 },
  { label: "≤ 45 min", value: 45 },
];

export function matchesFilters(
  r: FilterableRecipe,
  f: RecipeFilters,
  opts?: { untaggedAlways?: boolean },
): boolean {
  if (f.q && !r.title.toLowerCase().includes(f.q.trim().toLowerCase())) return false;
  if (f.meals.length > 0) {
    const hit =
      r.meal_types.some((m) => f.meals.includes(m)) ||
      Boolean(opts?.untaggedAlways && r.meal_types.length === 0);
    if (!hit) return false;
  }
  if (f.maxActive != null && (r.active_min == null || r.active_min > f.maxActive)) return false;
  if (f.kids && !r.kids_like) return false;
  if (f.reheats && !r.reheats_well) return false;
  return true;
}

export function filtersActive(f: RecipeFilters): boolean {
  return Boolean(f.q || f.meals.length || f.maxActive != null || f.kids || f.reheats);
}
