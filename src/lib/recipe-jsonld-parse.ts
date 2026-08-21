import { parseIsoDuration, parseMinutes, parseServings } from "@/lib/ingredient-parse";

export type ParsedWebRecipe = {
  title: string;
  ingredients: string[];
  steps: string[];
  activeMin: number | null;
  totalMin: number | null;
  servings: number;
  imageUrl: string | null;
  sourceName: string | null;
  sourceUrl: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  deg: "°", times: "×", frac12: "½", frac13: "⅓", frac23: "⅔",
  frac14: "¼", frac34: "¾", hellip: "…", mdash: "—", ndash: "–",
  rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
};

// Some sites embed HTML entities inside their JSON-LD strings.
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z0-9]+);/gi, (m, name) => NAMED_ENTITIES[name] ?? NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .trim();
}

// Prefer a human name over a URL/@id (unlike image, where url is what we want).
function nameOf(v: Json): string | null {
  if (typeof v === "string") return v.startsWith("http") ? null : v;
  if (Array.isArray(v)) {
    for (const x of v) {
      const n = nameOf(x);
      if (n) return n;
    }
    return null;
  }
  if (v && typeof v === "object" && typeof v.name === "string") return v.name;
  return null;
}

function typeIncludes(node: Json, t: string): boolean {
  const ty = node?.["@type"];
  if (!ty) return false;
  return Array.isArray(ty) ? ty.includes(t) : ty === t;
}

// Collect every object out of a parsed JSON-LD value (arrays and @graph).
function flatten(value: Json, out: Json[]) {
  if (Array.isArray(value)) {
    for (const v of value) flatten(v, out);
  } else if (value && typeof value === "object") {
    out.push(value);
    if (value["@graph"]) flatten(value["@graph"], out);
  }
}

function firstString(v: Json): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = firstString(x);
      if (s) return s;
    }
    return null;
  }
  if (v && typeof v === "object") return firstString(v.url ?? v.text ?? v.name);
  return null;
}

function extractSteps(instr: Json): string[] {
  const steps: string[] = [];
  for (const node of asArray(instr)) {
    if (typeof node === "string") {
      const t = node.trim();
      if (t) steps.push(t);
    } else if (node && typeof node === "object") {
      if (typeIncludes(node, "HowToSection") && node.itemListElement) {
        steps.push(...extractSteps(node.itemListElement));
      } else {
        const t = (node.text ?? node.name ?? "").toString().trim();
        if (t) steps.push(t);
      }
    }
  }
  return steps;
}

function extractScripts(html: string): string[] {
  const blocks: string[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) blocks.push(m[1]);
  return blocks;
}

export function parseRecipeFromHtml(html: string, sourceUrl: string): ParsedWebRecipe | null {
  const nodes: Json[] = [];
  for (const block of extractScripts(html)) {
    try {
      flatten(JSON.parse(block.trim()), nodes);
    } catch {
      // ignore malformed blocks
    }
  }

  const recipe = nodes.find((n) => typeIncludes(n, "Recipe"));
  if (!recipe) return null;

  const rawTitle = firstString(recipe.name);
  if (!rawTitle) return null;
  const title = decodeEntities(rawTitle);

  const ingredients = asArray<Json>(recipe.recipeIngredient)
    .map((x) => (typeof x === "string" ? x : firstString(x) ?? ""))
    .map((s) => decodeEntities(s))
    .filter(Boolean);

  const steps = extractSteps(recipe.recipeInstructions).map(decodeEntities).filter(Boolean);

  const totalMin =
    parseIsoDuration(recipe.totalTime) ??
    parseMinutes(recipe.totalTime) ??
    ((): number | null => {
      const cook = parseIsoDuration(recipe.cookTime) ?? 0;
      const prep = parseIsoDuration(recipe.prepTime) ?? 0;
      return cook + prep || null;
    })();
  const activeMin = parseIsoDuration(recipe.prepTime) ?? parseMinutes(recipe.prepTime);

  const yieldVal = Array.isArray(recipe.recipeYield)
    ? recipe.recipeYield.find((x: Json) => x != null)
    : recipe.recipeYield;
  const servings = parseServings(yieldVal != null ? String(yieldVal) : null);

  let host: string | null = null;
  try {
    host = new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    host = null;
  }
  const sourceName = nameOf(recipe.author) || nameOf(recipe.publisher) || host || null;

  return {
    title: title.trim(),
    ingredients,
    steps,
    activeMin,
    totalMin,
    servings,
    imageUrl: firstString(recipe.image),
    sourceName,
    sourceUrl,
  };
}
