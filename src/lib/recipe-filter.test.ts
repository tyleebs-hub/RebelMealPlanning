import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, matchesFilters, type FilterableRecipe } from "@/lib/recipe-filter";

const r = (over: Partial<FilterableRecipe>): FilterableRecipe => ({
  title: "Recipe", meal_types: ["dinner"], total_min: 30, kids_like: false, reheats_well: false, ...over,
});

describe("time filter goes off total time", () => {
  const f = { ...EMPTY_FILTERS, maxTime: 15 };
  it("keeps quick recipes", () => expect(matchesFilters(r({ total_min: 15 }), f)).toBe(true));
  it("drops slow-cooker recipes even with little active time", () =>
    expect(matchesFilters(r({ total_min: 480 }), f)).toBe(false));
  it("drops recipes with no known total time", () => expect(matchesFilters(r({ total_min: null }), f)).toBe(false));
});

describe("other filters", () => {
  it("searches titles case-insensitively", () => {
    expect(matchesFilters(r({ title: "Beef Chili" }), { ...EMPTY_FILTERS, q: " chili" })).toBe(true);
    expect(matchesFilters(r({ title: "Beef Chili" }), { ...EMPTY_FILTERS, q: "soup" })).toBe(false);
  });
  it("lets untagged recipes into the picker only when asked", () => {
    const f = { ...EMPTY_FILTERS, meals: ["dinner" as const] };
    expect(matchesFilters(r({ meal_types: [] }), f)).toBe(false);
    expect(matchesFilters(r({ meal_types: [] }), f, { untaggedAlways: true })).toBe(true);
  });
  it("kid-friendly and reheats flags", () => {
    expect(matchesFilters(r({ kids_like: false }), { ...EMPTY_FILTERS, kids: true })).toBe(false);
    expect(matchesFilters(r({ reheats_well: true }), { ...EMPTY_FILTERS, reheats: true })).toBe(true);
  });
});
