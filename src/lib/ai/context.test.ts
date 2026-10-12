import { describe, expect, it } from "vitest";
import { selectCandidates, weeksSince, type PlanningContext, type PlanRecipe, type Protein } from "@/lib/ai/context";

let n = 0;
function recipe(over: Partial<PlanRecipe> = {}): PlanRecipe {
  n++;
  return {
    id: `r${n}`, title: `Recipe ${String(n).padStart(3, "0")}`, meal_types: ["dinner"], active_min: 20, total_min: 40,
    scales_cheaply: true, reheats_well: false, kids_like: false, is_component: false, base_servings: 4,
    costPerServing: 2, protein: "chicken", rating: null, lastMadeAt: null, ...over,
  };
}

function ctx(library: PlanRecipe[], today = "2026-10-11"): PlanningContext {
  return {
    household: "leber", today, weekId: "w", library, libraryById: new Map(library.map((r) => [r.id, r])),
    history: [], recentRecipeIds: new Set(), cookEvents: [], slots: [],
    coverage: { dinnersFilled: 0, dinnerTarget: 5, lunchPortions: 0, lunchTarget: 10 },
    cfg: { dinnerServings: 4, lunchServings: 2, targetDinners: 5, targetLunches: 5 },
  };
}

describe("weeksSince", () => {
  it("counts whole weeks, null when never made", () => {
    expect(weeksSince("2026-10-11", "2026-10-04")).toBe(1);
    expect(weeksSince("2026-10-11", "2026-08-30")).toBe(6);
    expect(weeksSince("2026-10-11", null)).toBeNull();
  });
});

describe("selectCandidates", () => {
  it("never offers recipes the family rated 2 stars or lower", () => {
    const flop = recipe({ rating: 2 });
    const meh = recipe({ rating: 3 });
    const ids = selectCandidates(ctx([flop, meh])).map((r) => r.id);
    expect(ids).not.toContain(flop.id);
    expect(ids).toContain(meh.id);
  });

  it("keeps a favorite over unrated recipes that score high on everything else", () => {
    // 200 max-scoring unrated recipes: more than the per-protein cut (40) plus the lunch pool (90) can hold.
    const filler = Array.from({ length: 200 }, () => recipe({ protein: "chicken", reheats_well: true, kids_like: true }));
    const favorite = recipe({ protein: "chicken", rating: 5, reheats_well: false, costPerServing: null });
    const ids = selectCandidates(ctx([...filler, favorite])).map((r) => r.id);
    expect(ids).toContain(favorite.id);
    expect(ids.length).toBe(40 + 90); // both caps still apply
  });

  it("caps each protein for dinners", () => {
    const filler = Array.from({ length: 60 }, () => recipe({ protein: "beef" }));
    expect(selectCandidates(ctx(filler)).length).toBe(40);
  });

  it("respects the exclude set (recent meals, this week's cooks, earlier drafts)", () => {
    const a = recipe();
    const b = recipe();
    expect(selectCandidates(ctx([a, b]), new Set([a.id])).map((r) => r.id)).toEqual([b.id]);
  });

  it("offers every protein, not just the most common one", () => {
    const proteins: Protein[] = ["chicken", "beef", "fish", "vegetarian", "pork"];
    const lib = proteins.flatMap((p) => Array.from({ length: p === "chicken" ? 80 : 3 }, () => recipe({ protein: p })));
    const got = new Set(selectCandidates(ctx(lib)).map((r) => r.protein));
    for (const p of proteins) expect(got.has(p)).toBe(true);
  });
});
