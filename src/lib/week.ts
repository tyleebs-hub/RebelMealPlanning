import { DEFAULT_CONFIG, type HouseholdConfig, type MealType } from "@/lib/types";

// ---- days -------------------------------------------------------------------
// Weeks run Sunday -> Saturday. DAYS is in display order AND its index is each
// day's offset from the week start (a Sunday), so date math keys off it directly.
export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
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
// "Today" must be computed in the household's own timezone, not the server's:
// Vercel runs in UTC, so a naive new Date() reads a day ahead every evening out
// west. The Lebers are Pacific; Mom's household is in Utah (Mountain).
const HOUSEHOLD_TZ: Record<string, string> = {
  leber: "America/Los_Angeles",
  mom: "America/Denver",
};
export const tzFor = (household: string): string =>
  HOUSEHOLD_TZ[household] ?? "America/Los_Angeles";

// The Sunday that starts the current week in the given timezone.
export function weekStartOfToday(tz: string): string {
  return weekStartOf(todayIso(tz));
}

export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// A valid week start is a Sunday.
export function isWeekStart(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}

// en-CA formats as YYYY-MM-DD; the timeZone makes it that zone's calendar date.
export function todayIso(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

// The Sunday (week start) that contains a given date.
export function weekStartOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay()); // 0=Sun..6=Sat, back to Sunday
  return dt.toISOString().slice(0, 10);
}

// The day-of-week name for a date. DAYS is Sunday-first, matching getUTCDay.
export function dayNameOf(iso: string): Day {
  const [y, m, d] = iso.split("-").map(Number);
  return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
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

export function dateLabelIso(iso: string): string {
  return fmtShort(iso);
}

// ---- rows -------------------------------------------------------------------
export type CookRecipe = {
  id: string;
  title: string;
  image_path: string | null;
  base_servings: number;
  reheats_well: boolean;
  is_component: boolean;
  scales_cheaply: boolean;
  meal_types: MealType[];
  active_min: number | null;
  total_min: number | null;
  flat_cost: number | null;
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

export function computeLedger(ce: CookEvent, slots: Slot[], cfg: HouseholdConfig = DEFAULT_CONFIG): Ledger {
  const produced = ce.recipe.base_servings * ce.multiplier;
  const reserved = ce.kind === "dinner" ? cfg.dinnerServings : 0;
  const claimed =
    slots.filter((s) => s.cook_event_id === ce.id && s.fill_type === "leftover").length *
    cfg.lunchServings;
  return { produced, reserved, claimed, available: produced - reserved - claimed };
}

// ---- coverage (the headline readout) ----------------------------------------
export type Coverage = {
  dinnersFilled: number;
  dinnerTarget: number;
  lunchPortions: number;
  lunchTarget: number;
};

export function computeCoverage(slots: Slot[], cfg: HouseholdConfig = DEFAULT_CONFIG): Coverage {
  const filled = (meal: Meal) =>
    slots.filter(
      (s) => s.meal === meal && (s.fill_type === "cook" || s.fill_type === "leftover"),
    ).length;
  return {
    dinnersFilled: filled("dinner"),
    dinnerTarget: cfg.targetDinners,
    lunchPortions: filled("lunch") * cfg.lunchServings,
    lunchTarget: cfg.targetLunches * cfg.lunchServings,
  };
}

export const SAUCE_ROTATION = ["chimichurri", "teriyaki", "chipotle mayo", "pesto"];

// A cook's leftovers can't be eaten before it's made. A dinner cooked in the
// evening is available the NEXT day's lunch onward; a prep batch is available
// from its own day. Returns the earliest lunch day-index the cook can feed
// (0 = available all week, e.g. a cook with no day set).
export function earliestLunchIndex(cook: { day: Day | null; kind: "dinner" | "prep" }): number {
  if (!cook.day) return 0;
  const d = DAYS.indexOf(cook.day);
  if (d < 0) return 0;
  return d + (cook.kind === "dinner" ? 1 : 0);
}

export const dayIndex = (d: Day): number => DAYS.indexOf(d);
