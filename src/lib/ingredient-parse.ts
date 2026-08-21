// Shared parsing for ingredient lines and times. Used by the Paprika importer
// and the import-from-URL flow. Always preserve the original line as raw_text.

export type ParsedIngredient = {
  qty: number | null;
  unit: string | null;
  item: string;
  raw_text: string;
};

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

function parseLeadingQty(tokens: string[]): { qty: number | null; rest: string[] } {
  if (tokens.length === 0) return { qty: null, rest: tokens };
  const t0 = tokens[0];
  const glued = t0.match(/^(\d+)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅛⅜⅝⅞])$/);
  if (glued) {
    return { qty: parseInt(glued[1], 10) + UNICODE_FRACTIONS[glued[2]], rest: tokens.slice(1) };
  }
  if (UNICODE_FRACTIONS[t0] != null) return { qty: UNICODE_FRACTIONS[t0], rest: tokens.slice(1) };
  if (/^\d+$/.test(t0) && tokens[1] && /^\d+\/\d+$/.test(tokens[1])) {
    const [n, d] = tokens[1].split("/").map(Number);
    return { qty: parseInt(t0, 10) + n / d, rest: tokens.slice(2) };
  }
  if (/^\d+\/\d+$/.test(t0)) {
    const [n, d] = t0.split("/").map(Number);
    return { qty: n / d, rest: tokens.slice(1) };
  }
  if (/^\d+(?:\.\d+)?$/.test(t0)) return { qty: parseFloat(t0), rest: tokens.slice(1) };
  return { qty: null, rest: tokens };
}

export function parseIngredient(line: string): ParsedIngredient {
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

// "1 hr 20 min", "45 min", "1:30", "2 hours" -> minutes (or null)
export function parseMinutes(s?: string | null): number | null {
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
    const bare = str.match(/^(\d+)$/);
    if (bare) return parseInt(bare[1], 10);
    return null;
  }
  return mins || null;
}

// ISO 8601 duration "PT1H30M" -> minutes (or null)
export function parseIsoDuration(s?: string | null): number | null {
  if (!s) return null;
  const m = s.trim().match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!m) return null;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const total = h * 60 + min;
  return total || null;
}

export function parseServings(s?: string | null): number {
  if (!s) return 4;
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : 4;
}
