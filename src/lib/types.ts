// Shared domain constants and DB row types. See CLAUDE.md.

export const DINNER_SERVINGS = 4; // 2 adults + 2 kids
export const LUNCH_SERVINGS = 2; // Tyler + Charity
export const TARGET_DINNERS = 5; // per week
export const TARGET_LUNCHES = 5; // per week, x2 people = 10 portions

export type MealType =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "drink"
  | "dessert"
  | "side";

export type Recipe = {
  id: string;
  title: string;
  meal_types: MealType[];
  source_name: string | null;
  source_url: string | null;
  image_path: string | null;
  active_min: number | null;
  total_min: number | null;
  base_servings: number;
  scales_cheaply: boolean;
  reheats_well: boolean;
  kids_like: boolean;
  is_component: boolean;
  notes: string | null;
  last_made_at: string | null;
  created_at: string;
};

export type Ingredient = {
  id: string;
  recipe_id: string;
  sort_order: number | null;
  qty: number | null;
  unit: string | null;
  item: string;
  aisle: string | null;
  is_pantry_staple: boolean;
  raw_text: string | null;
};

export type Step = {
  id: string;
  recipe_id: string;
  sort_order: number | null;
  body: string | null;
};

// displayed times account for whether a recipe scales cheaply (CLAUDE.md > Time)
export function displayedActiveMin(r: Recipe, multiplier = 1): number | null {
  if (r.active_min == null) return null;
  return r.scales_cheaply ? r.active_min : r.active_min * multiplier;
}

export function displayedTotalMin(r: Recipe, multiplier = 1): number | null {
  if (r.total_min == null) return null;
  return r.scales_cheaply ? r.total_min : r.total_min * multiplier;
}
