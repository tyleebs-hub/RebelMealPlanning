import { describe, expect, it } from "vitest";
import { canonicalItem } from "@/lib/ingredient-canon";
import { recipeCost } from "@/lib/cost";

const same = (...items: string[]) => {
  const keys = items.map(canonicalItem);
  expect(new Set(keys).size, `${items.join(" | ")} -> ${keys.join(" | ")}`).toBe(1);
};
const different = (a: string, b: string) => expect(canonicalItem(a)).not.toBe(canonicalItem(b));

describe("canonicalItem merges spelling and prep variants", () => {
  it("flour", () => same("all-purpose flour (spooned & leveled)", "all purpose flour", "unbleached all-purpose flour", "AP flour"));
  it("sugars", () => {
    same("confectioners’ sugar", "confectioners' sugar", "powdered sugar", "icing sugar");
    same("light or dark brown sugar", "packed brown sugar", "dark brown sugar");
  });
  it("butter, salt, oil", () => {
    same("unsalted butter, softened", "salted butter", "butter");
    same("kosher salt", "sea salt", "salt, to taste");
    same("extra-virgin olive oil", "olive oil");
  });
  it("prep words and serving clauses", () => {
    expect(canonicalItem("yellow onion, diced")).toBe("yellow onion");
    expect(canonicalItem("optional: fresh parsley")).toBe("parsley");
    expect(canonicalItem("chicken broth or stock")).toBe("chicken broth");
    expect(canonicalItem("2 large eggs, beaten")).toBe("egg");
  });
  it("skips a leading clause that strips to nothing", () => {
    expect(canonicalItem("unbleached, all-purpose flour, more for dusting")).toBe("all-purpose flour");
  });
});

describe("canonicalItem keeps distinct ingredients distinct", () => {
  it("onion colors", () => {
    different("yellow onion", "red onion");
    different("red onion", "white onion");
    different("yellow onion", "green onions");
  });
  it("cuts of chicken", () => different("boneless skinless chicken breasts", "chicken thighs"));
  it("kinds of sugar", () => different("brown sugar", "powdered sugar"));
});

describe("plurals", () => {
  it("singularizes regular plurals", () => {
    expect(canonicalItem("onions")).toBe("onion");
    expect(canonicalItem("tomatoes")).toBe("tomato");
    expect(canonicalItem("cherries")).toBe("cherry");
  });
  it("only turns -ves into -f where English does", () => {
    expect(canonicalItem("bay leaves")).toBe("bay leaf");
    expect(canonicalItem("pecan halves")).toBe("pecan half");
    expect(canonicalItem("garlic cloves, minced")).toBe("garlic clove"); // was "garlic clof"
    expect(canonicalItem("black olives")).toBe("black olive"); // was "black olif"
  });
  it("leaves words that only look plural alone", () => {
    expect(canonicalItem("molasses")).toBe("molasses");
    expect(canonicalItem("hummus")).toBe("hummus");
    expect(canonicalItem("asparagus")).toBe("asparagus");
  });
});

describe("recipe cost uses canonical keys", () => {
  it("prices a variant line from the canonical entry and flags unpriced lines", () => {
    const prices = new Map([["all-purpose flour|cups", 0.5]]);
    const rc = recipeCost(
      [
        { qty: 2, unit: "cups", item: "all-purpose flour (spooned & leveled)" },
        { qty: 1, unit: "cups", item: "mystery spice" },
        { qty: null, unit: "", item: "salt, to taste" },
      ],
      prices,
    );
    expect(rc).toEqual({ cost: 1, unpriced: 1, total: 2 });
  });
});
