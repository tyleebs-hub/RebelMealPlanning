// Canonicalize an ingredient's item text to a stable key used for grocery
// merging and pricing (not for display — recipes still show the original item).
// Strips prep/size/state noise and serving clauses; normalizes spelling,
// plurals, and synonyms; keeps meaningful identity (chicken breast vs thigh,
// brown vs powdered sugar, onion colors stay distinct).

const STRIP = new Set(
  ("diced chopped minced sliced slivered grated shredded crushed mashed melted softened cubed halved quartered peeled cored seeded deseeded pitted rinsed drained cooked uncooked beaten whisked sifted packed loosely firmly tightly chilled warmed thawed boneless skinless trimmed cleaned finely coarsely thinly roughly freshly fresh large small medium jumbo ripe overripe room temperature divided optional garnish plus more needed taste to about approximately around well lightly very quality preferably homemade prepared cut into pieces piece each cold warm hot cool roasted toasted cooled level leveled spooned degrees juiced squeezed crumbled shaved zested grilled steamed drizzled").split(" "),
);

const PHRASE: [RegExp, string][] = [
  [/all[\s-]*purpose flour/g, "all-purpose flour"],
  [/\bap flour\b/g, "all-purpose flour"],
  [/\bplain flour\b/g, "all-purpose flour"],
  [/confectioner'?s?'? sugar/g, "powdered sugar"],
  [/icing sugar/g, "powdered sugar"],
  [/(caster|superfine|granulated white|white granulated) sugar/g, "granulated sugar"],
  [/(light or dark|dark or light|light and dark|dark and light|light|dark) brown sugar/g, "brown sugar"],
  [/extra[\s-]*virgin olive oil/g, "olive oil"],
  [/\bevoo\b/g, "olive oil"],
  [/(kosher|sea|table|fine sea|flaky|himalayan|fine) salt/g, "salt"],
  [/(un)?salted butter/g, "butter"],
  [/(scallions?|spring onions?)/g, "green onion"],
  [/garbanzo beans?/g, "chickpeas"],
  [/\bgarbanzos\b/g, "chickpeas"],
  [/pure vanilla extract/g, "vanilla extract"],
  [/(roma|plum|cherry|grape) tomatoes?/g, "tomato"],
  [/(baby )?bella mushrooms?/g, "mushroom"],
  [/cremini mushrooms?/g, "mushroom"],
];
const SYN: Record<string, string> = { coriander: "cilantro", capsicum: "bell pepper", aubergine: "eggplant", courgette: "zucchini", rocket: "arugula", prawns: "shrimp", prawn: "shrimp" };
const KEEP_PLURAL = new Set("molasses hummus asparagus couscous swiss brussels greens oats chives".split(" "));

function singular(w: string): string {
  if (KEEP_PLURAL.has(w) || w.endsWith("ss")) return w;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("oes") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("ves") && w.length > 4) return w.slice(0, -3) + "f";
  if (w.endsWith("s") && !w.endsWith("us") && w.length > 3) return w.slice(0, -1);
  return w;
}

export function canonicalItem(text: string): string {
  if (!text) return "";
  let s = String(text).toLowerCase();
  s = s.replace(/[’‘]/g, "'");
  s = s.replace(/\([^)]*\)/g, " ");
  for (const [re, to] of PHRASE) s = s.replace(re, to);
  s = s.replace(/^\s*optional\s*:?\s*/i, " ");
  s = s.split(/,| or | for | \/ /)[0];
  s = s.replace(/[*"'`]/g, " ").replace(/[.;:]/g, " ");
  s = s.replace(/\d+(\.\d+)?/g, " ");
  let toks = s.split(/\s+/).map((w) => w.trim()).filter(Boolean);
  toks = toks.map((w) => SYN[w] || w);
  toks = toks.filter((w) => !STRIP.has(w));
  toks = toks.map(singular);
  toks = toks.filter((w) => w && !STRIP.has(w) && w.length > 1);
  const out = toks.join(" ").trim();
  return out || String(text).toLowerCase().trim();
}
