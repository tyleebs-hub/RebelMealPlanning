/**
 * One-time importer for a Paprika ".paprikarecipes" export.
 * See CLAUDE.md > Paprika integration.
 *
 * A .paprikarecipes file is a ZIP archive of gzipped JSON files, one per recipe.
 * This reads that archive, maps each recipe into recipes/ingredients/steps rows,
 * and writes them to Supabase. Ingredient lines are parsed into structured
 * columns where possible; the original line is always kept in raw_text.
 * meal_types are inferred from Paprika categories, left empty when unknown.
 *
 * Usage:
 *   npm run import:paprika -- path/to/export.paprikarecipes
 *   npm run import:paprika -- path/to/export.paprikarecipes --dry   # preview only
 *
 * Requires in .env.local (loaded via --env-file):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY   (the sb_secret_... key; bypasses RLS. never commit it.)
 */
import { readFileSync } from "node:fs";
import { unzipSync, gunzipSync, strFromU8 } from "fflate";
import { createClient } from "@supabase/supabase-js";

// ---- Paprika JSON shape (only the fields we use) ----------------------------
type PaprikaRecipe = {
  uid?: string;
  name?: string;
  ingredients?: string; // newline-separated
  directions?: string; // newline-separated
  categories?: string[];
  servings?: string;
  prep_time?: string;
  cook_time?: string;
  total_time?: string;
  source?: string;
  source_url?: string;
  notes?: string;
};

type MealType =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "drink"
  | "dessert"
  | "side";

// ---- parsing helpers --------------------------------------------------------

// "1 hr 20 min", "45 min", "1:30", "2 hours" -> minutes (or null)
function parseMinutes(s?: string): number | null {
  if (!s) return null;
  const str = s.trim().toLowerCase();
  if (!str) return null;
  const clock = str.match(/^(\d+):(\d{1,2})$/);
  if (clock) return parseInt(clock[1], 10) * 60 + parseInt(clock[2], 10);
  let mins = 0;
  let matched = false;
  const h = str.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/);
  if (h) {
    mins += Math.round(parseFloat(h[1]) * 60);
    matched = true;
  }
  const m = str.match(/(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)\b/);
  if (m) {
    mins += Math.round(parseFloat(m[1]));
    matched = true;
  }
  if (!matched) {
    const bare = str.match(/^(\d+)$/); // bare number = minutes
    if (bare) return parseInt(bare[1], 10);
    return null;
  }
  return mins || null;
}

function parseServings(s?: string): number {
  if (!s) return 4;
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : 4;
}

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75,
  "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8, "⅙": 1 / 6, "⅛": 0.125,
  "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
};

const UNITS = new Set([
  "tsp", "teaspoon", "teaspoons", "tbsp", "tablespoon", "tablespoons",
  "cup", "cups", "oz", "ounce", "ounces", "lb", "lbs", "pound", "pounds",
  "g", "gram", "grams", "kg", "ml", "l", "liter", "liters", "clove", "cloves",
  "can", "cans", "jar", "jars", "package", "packages", "pkg", "stick", "sticks",
  "pinch", "dash", "quart", "quarts", "pint", "pints", "slice", "slices",
]);

// Parse a leading quantity like "1", "1/2", "1 1/2", "½", "1½", "2.5".
function parseLeadingQty(tokens: string[]): { qty: number | null; rest: string[] } {
  if (tokens.length === 0) return { qty: null, rest: tokens };
  let t0 = tokens[0];
  // split a leading unicode fraction glued to a number, e.g. "1½"
  const glued = t0.match(/^(\d+)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅛⅜⅝⅞])$/);
  if (glued) {
    return { qty: parseInt(glued[1], 10) + UNICODE_FRACTIONS[glued[2]], rest: tokens.slice(1) };
  }
  if (UNICODE_FRACTIONS[t0] != null) {
    return { qty: UNICODE_FRACTIONS[t0], rest: tokens.slice(1) };
  }
  // "1 1/2"
  if (/^\d+$/.test(t0) && tokens[1] && /^\d+\/\d+$/.test(tokens[1])) {
    const [n, d] = tokens[1].split("/").map(Number);
    return { qty: parseInt(t0, 10) + n / d, rest: tokens.slice(2) };
  }
  if (/^\d+\/\d+$/.test(t0)) {
    const [n, d] = t0.split("/").map(Number);
    return { qty: n / d, rest: tokens.slice(1) };
  }
  if (/^\d+(?:\.\d+)?$/.test(t0)) {
    return { qty: parseFloat(t0), rest: tokens.slice(1) };
  }
  return { qty: null, rest: tokens };
}

type ParsedIngredient = { qty: number | null; unit: string | null; item: string; raw_text: string };

function parseIngredient(line: string): ParsedIngredient {
  const raw_text = line.trim();
  const tokens = raw_text.split(/\s+/);
  const { qty, rest } = parseLeadingQty(tokens);
  let unit: string | null = null;
  let itemTokens = rest;
  if (rest.length > 0) {
    const maybeUnit = rest[0].replace(/\.$/, "").toLowerCase();
    if (UNITS.has(maybeUnit)) {
      unit = maybeUnit;
      itemTokens = rest.slice(1);
    }
  }
  const item = itemTokens.join(" ").trim() || raw_text;
  return { qty, unit, item, raw_text };
}

// Infer meal_types from Paprika categories. Leave empty when nothing matches.
function inferMealTypes(categories?: string[]): MealType[] {
  if (!categories) return [];
  const out = new Set<MealType>();
  for (const raw of categories) {
    const c = raw.toLowerCase();
    if (/breakfast|brunch/.test(c)) out.add("breakfast");
    if (/\blunch\b/.test(c)) out.add("lunch");
    if (/dinner|main|entree|entrée|supper/.test(c)) out.add("dinner");
    if (/dessert|sweet|baking/.test(c)) out.add("dessert");
    if (/side/.test(c)) out.add("side");
    if (/drink|beverage|cocktail|smoothie/.test(c)) out.add("drink");
    if (/snack|appetizer/.test(c)) out.add("snack");
  }
  return [...out];
}

function splitLines(s?: string): string[] {
  if (!s) return [];
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// ---- archive reading --------------------------------------------------------

function readArchive(path: string): PaprikaRecipe[] {
  const buf = new Uint8Array(readFileSync(path));
  const entries = unzipSync(buf);
  const recipes: PaprikaRecipe[] = [];
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith("/") || data.length === 0) continue;
    if (!/\.paprikarecipe$/i.test(name) && !/\.json$/i.test(name)) continue;
    let json: string;
    try {
      json = strFromU8(gunzipSync(data)); // normal case: gzipped JSON
    } catch {
      json = strFromU8(data); // fallback: plain JSON
    }
    try {
      recipes.push(JSON.parse(json) as PaprikaRecipe);
    } catch {
      console.warn(`  ! skipped unparseable entry: ${name}`);
    }
  }
  return recipes;
}

// ---- main -------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const archivePath = args.find((a) => !a.startsWith("--"));

  if (!archivePath) {
    console.error("Usage: npm run import:paprika -- path/to/export.paprikarecipes [--dry]");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!dry && (!url || !secret)) {
    console.error(
      "Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.\n" +
        "(SUPABASE_SECRET_KEY is the sb_secret_... key. It bypasses RLS. Never commit it.)",
    );
    process.exit(1);
  }

  console.log(`Reading ${archivePath} ...`);
  const paprika = readArchive(archivePath);
  console.log(`Found ${paprika.length} recipes in the archive.`);

  const mapped = paprika
    .filter((p) => p.name && p.name.trim())
    .map((p) => {
      const ingredients = splitLines(p.ingredients).map(parseIngredient);
      const steps = splitLines(p.directions);
      return {
        recipe: {
          title: p.name!.trim(),
          meal_types: inferMealTypes(p.categories),
          source_name: "Paprika import",
          source_url: p.source_url || null,
          active_min: parseMinutes(p.prep_time),
          total_min: parseMinutes(p.total_time) ?? parseMinutes(p.cook_time),
          base_servings: parseServings(p.servings),
          notes: p.notes?.trim() || null,
        },
        ingredients,
        steps,
      };
    });

  const untagged = mapped.filter((m) => m.recipe.meal_types.length === 0).length;
  console.log(
    `Mapped ${mapped.length} recipes. ${untagged} have no meal_type (will show a "needs a label" prompt).`,
  );

  if (dry) {
    console.log("\n--dry: no writes. Sample of first 3:");
    for (const m of mapped.slice(0, 3)) {
      console.log(`\n• ${m.recipe.title}  [${m.recipe.meal_types.join(", ") || "no label"}]`);
      console.log(
        `  servings=${m.recipe.base_servings} active=${m.recipe.active_min ?? "?"} total=${m.recipe.total_min ?? "?"}`,
      );
      console.log(`  ${m.ingredients.length} ingredients, ${m.steps.length} steps`);
      for (const ing of m.ingredients.slice(0, 3)) {
        console.log(`    - qty=${ing.qty ?? ""} unit=${ing.unit ?? ""} item="${ing.item}"`);
      }
    }
    return;
  }

  const supabase = createClient(url!, secret!, { auth: { persistSession: false } });

  // Clear any prior Paprika import so re-runs are clean (leaves hand-seeded
  // recipes alone). Cascades to their ingredients and steps.
  const { count: existing } = await supabase
    .from("recipes")
    .select("id", { count: "exact", head: true })
    .eq("source_name", "Paprika import");
  if (existing && existing > 0) {
    console.log(`Removing ${existing} previously imported recipes...`);
    const { error } = await supabase.from("recipes").delete().eq("source_name", "Paprika import");
    if (error) throw error;
  }

  let ok = 0;
  for (const m of mapped) {
    const { data: inserted, error: rErr } = await supabase
      .from("recipes")
      .insert(m.recipe)
      .select("id")
      .single();
    if (rErr || !inserted) {
      console.warn(`  ! failed to insert "${m.recipe.title}": ${rErr?.message}`);
      continue;
    }
    const recipeId = inserted.id as string;

    if (m.ingredients.length > 0) {
      const rows = m.ingredients.map((ing, i) => ({
        recipe_id: recipeId,
        sort_order: i + 1,
        qty: ing.qty,
        unit: ing.unit,
        item: ing.item,
        raw_text: ing.raw_text,
      }));
      const { error } = await supabase.from("ingredients").insert(rows);
      if (error) console.warn(`  ! ingredients for "${m.recipe.title}": ${error.message}`);
    }
    if (m.steps.length > 0) {
      const rows = m.steps.map((body, i) => ({ recipe_id: recipeId, sort_order: i + 1, body }));
      const { error } = await supabase.from("steps").insert(rows);
      if (error) console.warn(`  ! steps for "${m.recipe.title}": ${error.message}`);
    }
    ok++;
    if (ok % 25 === 0) console.log(`  ...${ok}/${mapped.length}`);
  }

  console.log(`\nDone. Imported ${ok}/${mapped.length} recipes.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
