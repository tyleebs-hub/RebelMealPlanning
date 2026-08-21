import {
  DINNER_SERVINGS,
  LUNCH_SERVINGS,
  TARGET_DINNERS,
  TARGET_LUNCHES,
  type MealType,
} from "@/lib/types";

// ---- days -------------------------------------------------------------------
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];
export type Meal = "lunch" | "dinner";

const DAY_LABEL: Record<Day, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};
export const dayLabel = (d: Day) => DAY_LABEL[d];

// ---- date math (calendar dates as YYYY-MM-DD, UTC-based to avoid drift) ------
function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function mondayOfToday(): string {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return localIso(monday);
}

export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function isMonday(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}

export function dateForDay(mondayIso: string, day: Day): string {
  return addDaysIso(mondayIso, DAYS.indexOf(day));
}

function fmtShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatWeekRange(mondayIso: string): string {
  return `${fmtShort(mondayIso)} – ${fmtShort(addDaysIso(mondayIso, 6))}`;
}

export function dayDateLabel(mondayIso: string, day: Day): string {
  return fmtShort(dateForDay(mondayIso, day));
}

// ---- rows -------------------------------------------------------------------
export type CookRecipe = {
  id: string;
  title: string;
  base_servings: number;
  reheats_well: boolean;
  is_component: boolean;
  scales_cheaply: boolean;
  meal_types: MealType[];
  active_min: number | null;
  total_min: number | null;
};

export type CookEvent = {
  id: string;
  week_id: string;
  recipe_id: string;
  multiplier: number;
  day: Day | null;
  kind: "dinner" | "prep";
  recipe: CookRecipe;
};

export type Slot = {
  id: string;
  week_id: string;
  day: Day;
  meal: Meal;
  fill_type: "cook" | "leftover" | "out" | null;
  cook_event_id: string | null;
  out_label: string | null;
  sauce: string | null;
};

// ---- ledger (see CLAUDE.md > Ledger math) -----------------------------------
export type Ledger = {
  produced: number;
  reserved: number;
  claimed: number;
  available: number;
};

export function computeLedger(ce: CookEvent, slots: Slot[]): Ledger {
  const produced = ce.recipe.base_servings * ce.multiplier;
  const reserved = ce.kind === "dinner" ? DINNER_SERVINGS : 0;
  const claimed =
    slots.filter((s) => s.cook_event_id === ce.id && s.fill_type === "leftover").length *
    LUNCH_SERVINGS;
  return { produced, reserved, claimed, available: produced - reserved - claimed };
}

// ---- coverage (the headline readout) ----------------------------------------
export type Coverage = {
  dinnersFilled: number;
  dinnerTarget: number;
  lunchPortions: number;
  lunchTarget: number;
};

export function computeCoverage(slots: Slot[]): Coverage {
  const filled = (meal: Meal) =>
    slots.filter(
      (s) => s.meal === meal && (s.fill_type === "cook" || s.fill_type === "leftover"),
    ).length;
  return {
    dinnersFilled: filled("dinner"),
    dinnerTarget: TARGET_DINNERS,
    lunchPortions: filled("lunch") * LUNCH_SERVINGS,
    lunchTarget: TARGET_LUNCHES * LUNCH_SERVINGS,
  };
}

export const SAUCE_ROTATION = ["chimichurri", "teriyaki", "chipotle mayo", "pesto"];
