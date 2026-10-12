import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DAYS,
  addDaysIso,
  computeCoverage,
  computeLedger,
  dateForDay,
  dayNameOf,
  earliestLunchIndex,
  isWeekStart,
  todayIso,
  tzFor,
  weekStartOf,
  weekStartOfToday,
  type CookEvent,
  type Slot,
} from "@/lib/week";
import type { HouseholdConfig } from "@/lib/types";

// Week of Sun 2026-10-04 .. Sat 2026-10-10.
const SUN = "2026-10-04";

describe("weeks run Sunday to Saturday", () => {
  it("lists Sunday first", () => {
    expect(DAYS).toEqual(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
  });

  it("dates each day from the Sunday start", () => {
    expect(dateForDay(SUN, "sun")).toBe("2026-10-04");
    expect(dateForDay(SUN, "mon")).toBe("2026-10-05");
    expect(dateForDay(SUN, "fri")).toBe("2026-10-09");
    expect(dateForDay(SUN, "sat")).toBe("2026-10-10");
  });

  it("maps every day of the week back to its Sunday", () => {
    for (const d of DAYS) expect(weekStartOf(dateForDay(SUN, d))).toBe(SUN);
  });

  it("names each date's weekday consistently with DAYS", () => {
    for (const d of DAYS) expect(dayNameOf(dateForDay(SUN, d))).toBe(d);
  });

  it("crosses month and year boundaries", () => {
    expect(weekStartOf("2027-01-01")).toBe("2026-12-27"); // a Friday
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("is unaffected by DST changes", () => {
    expect(addDaysIso("2026-11-01", 1)).toBe("2026-11-02"); // fall back
    expect(addDaysIso("2027-03-14", 1)).toBe("2027-03-15"); // spring forward
    expect(weekStartOf("2026-11-03")).toBe("2026-11-01");
  });

  it("only accepts Sundays as a week start", () => {
    expect(isWeekStart("2026-10-04")).toBe(true);
    expect(isWeekStart("2026-10-05")).toBe(false); // the old Monday anchor
  });
});

describe("today is the household's local day, not the server's UTC day", () => {
  afterEach(() => vi.useRealTimers());

  it("maps households to their timezones", () => {
    expect(tzFor("leber")).toBe("America/Los_Angeles");
    expect(tzFor("mom")).toBe("America/Denver");
    expect(tzFor("unknown")).toBe("America/Los_Angeles");
  });

  it("keeps an evening in the West on the same day (UTC is already tomorrow)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T04:00:00Z")); // Mon 9pm PDT, 10pm MDT
    expect(todayIso(tzFor("leber"))).toBe("2026-10-05");
    expect(todayIso(tzFor("mom"))).toBe("2026-10-05");
  });

  it("rolls Mountain over to the next day an hour before Pacific", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T06:30:00Z")); // 11:30pm PDT, 12:30am MDT
    expect(todayIso(tzFor("leber"))).toBe("2026-10-05");
    expect(todayIso(tzFor("mom"))).toBe("2026-10-06");
  });

  it("does not jump to next week on Saturday night", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T05:30:00Z")); // Sat 10:30pm PDT; Sunday in UTC
    expect(weekStartOfToday(tzFor("leber"))).toBe("2026-10-04");
  });
});

describe("leftovers can't be eaten before they're cooked", () => {
  it("dinner feeds lunches from the next day, prep from the same day", () => {
    expect(earliestLunchIndex({ day: "sun", kind: "dinner" })).toBe(1);
    expect(earliestLunchIndex({ day: "sun", kind: "prep" })).toBe(0);
    expect(earliestLunchIndex({ day: null, kind: "dinner" })).toBe(0);
    expect(earliestLunchIndex({ day: "sat", kind: "dinner" })).toBe(DAYS.length); // nothing left this week
  });
});

// ---- ledger + coverage (CLAUDE.md > Ledger math) ----------------------------

const CFG: HouseholdConfig = { dinnerServings: 4, lunchServings: 2, targetDinners: 5, targetLunches: 5 };

function cook(id: string, baseServings: number, multiplier: number, kind: "dinner" | "prep" = "dinner"): CookEvent {
  return {
    id,
    week_id: "w",
    recipe_id: `r-${id}`,
    multiplier,
    day: "mon",
    kind,
    recipe: {
      id: `r-${id}`, title: id, image_path: null, base_servings: baseServings, reheats_well: true,
      is_component: false, scales_cheaply: true, meal_types: ["dinner"], active_min: 15, total_min: 55, flat_cost: null,
    },
  };
}

let n = 0;
function slot(day: Slot["day"], meal: Slot["meal"], fill: Slot["fill_type"], cookId: string | null = null): Slot {
  return { id: `s${n++}`, week_id: "w", day, meal, fill_type: fill, cook_event_id: cookId, out_label: null, sauce: null };
}

describe("ledger", () => {
  it("chili at 3x feeds dinner plus four packed lunches exactly", () => {
    const chili = cook("chili", 4, 3);
    const slots = [
      slot("mon", "dinner", "cook", "chili"),
      ...(["tue", "wed", "thu", "fri"] as const).map((d) => slot(d, "lunch", "leftover", "chili")),
    ];
    expect(computeLedger(chili, slots, CFG)).toEqual({ produced: 12, reserved: 4, claimed: 8, available: 0 });
  });

  it("goes negative when overcommitted", () => {
    const chili = cook("chili", 4, 2);
    const slots = (["tue", "wed", "thu"] as const).map((d) => slot(d, "lunch", "leftover", "chili"));
    expect(computeLedger(chili, slots, CFG).available).toBe(8 - 4 - 6);
  });

  it("a prep batch reserves nothing for dinner", () => {
    expect(computeLedger(cook("chicken", 6, 1, "prep"), [], CFG).reserved).toBe(0);
  });

  it("ignores other cooks' slots", () => {
    const a = cook("a", 4, 2);
    expect(computeLedger(a, [slot("tue", "lunch", "leftover", "b")], CFG).claimed).toBe(0);
  });
});

describe("coverage", () => {
  it("counts cooked and leftover slots, not out slots", () => {
    const slots = [
      slot("mon", "dinner", "cook", "x"),
      slot("tue", "dinner", "leftover", "x"),
      slot("fri", "dinner", "out"),
      slot("tue", "lunch", "leftover", "x"),
      slot("wed", "lunch", "leftover", "x"),
      slot("thu", "lunch", null),
    ];
    expect(computeCoverage(slots, CFG)).toEqual({ dinnersFilled: 2, dinnerTarget: 5, lunchPortions: 4, lunchTarget: 10 });
  });

  it("uses each household's own servings and targets", () => {
    const mom: HouseholdConfig = { dinnerServings: 3, lunchServings: 3, targetDinners: 5, targetLunches: 5 };
    const c = computeCoverage([slot("tue", "lunch", "leftover", "x")], mom);
    expect(c.lunchPortions).toBe(3);
    expect(c.lunchTarget).toBe(15);
  });
});
