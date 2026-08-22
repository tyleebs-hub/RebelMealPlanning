// Infer a grocery aisle (and pantry-staple flag) from an ingredient name, so
// ingredients added via the app land in the right section and collapse staples.
// Same buckets as the grocery list: Produce | Meat | Dairy | Bakery | Frozen | Pantry.

const has = (s: string, ...kw: string[]) => kw.some((k) => s.includes(k));

const STAPLE_WORDS = [
  "salt", "pepper", "baking powder", "baking soda", "vanilla", "olive oil",
  "vegetable oil", "canola oil", "sesame oil", "cooking spray", "cornstarch",
  "cream of tartar", "cinnamon", "nutmeg", "paprika", "cumin", "chili powder",
  "garlic powder", "onion powder", "italian seasoning", "oregano", "cayenne",
  "red pepper flakes", "ground ginger", "black pepper",
];
const isStaple = (s: string) =>
  STAPLE_WORDS.some((w) => s.includes(w)) || /\bsalt and pepper\b/.test(s) || /\boil\b/.test(s);

export function inferAisleAndStaple(itemRaw: string): { aisle: string | null; staple: boolean } {
  const s = ` ${itemRaw.toLowerCase().trim()} `;

  // section-header / parse junk → leave uncategorized
  if (/:\s*$/.test(itemRaw) || has(s, "1x 2x 3x") ||
    /^\s*(sauce|topping|filling|coating|glaze|streusel|crumb|frosting|for the|to serve|serving|dry ingredients|wet ingredients|batter|dough|garnish|optional|note)\b/.test(itemRaw.toLowerCase())) {
    return { aisle: null, staple: false };
  }

  if (has(s, "frozen") || has(s, "ice cream")) return { aisle: "Frozen", staple: false };

  // pantry markers that later rules would miscategorize
  if (has(s, "broth", "stock", "bouillon", "cream of chicken", "cream of mushroom",
    "coconut milk", "almond milk", "oat milk", "condensed milk", "evaporated milk",
    "tomato paste", "tomato sauce", "crushed tomato", "diced tomato", "canned",
    "sun-dried tomato", "peanut butter", "cream of tartar", "corn syrup", "cornstarch",
    "corn starch", "cornmeal")) {
    return { aisle: "Pantry", staple: isStaple(s) };
  }

  if ((has(s, "butter") && !has(s, "peanut butter", "apple butter", "cocoa butter", "butter beans", "butter lettuce")) ||
    has(s, "milk") ||
    (has(s, "cream") && !has(s, "cream of tartar", "cream of chicken", "cream of mushroom", "ice cream", "creamed corn")) ||
    has(s, "cheese", "parmesan", "cheddar", "mozzarella", "ricotta", "feta", "cotija",
      "monterey", "gruyere", "provolone", "mascarpone", "yogurt", "buttermilk", "half and half",
      "half & half", "margarine", "sour cream", "heavy cream", "whipping cream") ||
    /\begg\b/.test(s) || /\beggs\b/.test(s) || has(s, "egg white", "egg yolk")) {
    return { aisle: "Dairy", staple: false };
  }

  if (has(s, "chicken", "beef", "pork", "bacon", "sausage", "turkey", "steak", "ground meat",
    "ground beef", "ground turkey", "ground pork", "shrimp", "salmon", "tilapia", "cod",
    "fish", "tuna", "meatball", "chorizo", "prosciutto", "pancetta", "brisket", "ribs",
    "tenderloin", "drumstick", "chicken breast", "chicken thigh", "thighs", "ham ",
    " ham", "hot dog", "pepperoni", "ground chicken") &&
    !has(s, "chicken broth", "beef broth", "cream of chicken")) {
    return { aisle: "Meat", staple: false };
  }

  if (has(s, "tortilla", "bagel", "pita", "naan", "baguette", "croissant", "hoagie",
    "hamburger bun", "hot dog bun", "slider bun", "brioche", "english muffin",
    "dinner roll", "pie crust", "puff pastry", "pizza dough", "pizza crust", "breadstick") ||
    (/\bbread\b/.test(s) && !has(s, "bread flour", "breadcrumb", "bread crumb")) ||
    /\bbuns?\b/.test(s) ||
    (/\brolls?\b/.test(s) && !has(s, "spring roll", "egg roll"))) {
    return { aisle: "Bakery", staple: false };
  }

  const processed = has(s, "powder", "dried", "ground", "paste", "canned", "sauce",
    "syrup", "extract", "flakes", "seasoning");
  if (!processed) {
    if (has(s, "onion", "scallion", "shallot", "leek", "green onion") ||
      /\bgarlic\b/.test(s) || /\bginger\b/.test(s) ||
      has(s, "lemon", "lime", "cilantro", "parsley", "spinach", "kale", "lettuce",
        "romaine", "arugula", "cabbage", "carrot", "celery", "potato", "tomato",
        "cucumber", "zucchini", "squash", "mushroom", "broccoli", "cauliflower",
        "bell pepper", "jalapeno", "jalapeño", "poblano", "serrano", "habanero",
        "banana", "apple", "pear", "mango", "blueberr", "strawberr", "raspberr",
        "blackberr", "avocado", "peas", "green bean", "asparagus", "beet", "radish",
        "rhubarb", "grape", "lime wedge", "fresh herb", "mint", "basil", "rosemary",
        "thyme", "sage", "dill", "chive", "corn", "sweet potato", "plantain",
        "lemongrass", "sprout", "fresh ") ||
      (/\bchile?s?\b/.test(s) && !has(s, "chili powder", "chile powder"))) {
      return { aisle: "Produce", staple: false };
    }
  }

  const PANTRY = ["flour", "sugar", "cocoa", "chocolate", "rice", "pasta", "noodle",
    "spaghetti", "macaroni", "oats", "oatmeal", "quinoa", "lentil", "beans", "chickpea",
    "breadcrumb", "panko", "cracker", "salsa", "ketchup", "mustard", "mayo", "vinegar",
    "honey", "syrup", "soy sauce", "worcestershire", "sriracha", "hot sauce", "oil",
    "yeast", "extract", "baking", "cinnamon", "cumin", "paprika", "oregano", "seasoning",
    "powder", "spice", "salt", "pepper", "nut", "almond", "walnut", "pecan", "raisin",
    "sesame", "water", "wine", "broth", "sauce", "dressing", "pumpkin", "gelatin",
    "sprinkles", "food color", "cornmeal", "confectioners", "molasses", "tahini"];
  if (PANTRY.some((w) => s.includes(w))) return { aisle: "Pantry", staple: isStaple(s) };

  return { aisle: null, staple: false };
}
