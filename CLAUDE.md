# Meal Planner

A private household meal planner for Tyler and Charity Leber. Two users, one household.
Not a product. Optimize for the two of them actually using it, not for generality.

## Stack

- Next.js (App Router) on Vercel
- Supabase Postgres + Supabase Storage for dish photos
- Tailwind
- No third-party auth provider. See Auth below.

Deploy via the Vercel GitHub integration. Every push to `main` ships.

## The one idea that matters

Most meal planners assume one recipe fills one meal. This one doesn't.
Tyler cooks once and that cook feeds multiple slots across multiple days and both meal types.

**Cook events produce servings. Slots consume them.** Never model a slot as owning a recipe
directly. A slot points at a cook event.

Constants:

```
DINNER_SERVINGS = 4    // 2 adults + 2 kids
LUNCH_SERVINGS  = 2    // Tyler + Charity
TARGET_DINNERS  = 5    // per week; the other 2 nights are Costco pizza or eating out
TARGET_LUNCHES  = 5    // per week, x2 people = 10 portions
```

A typical week: Monday chili cooked at 3x yields 12 servings. Four are eaten Monday night,
eight get packaged and claimed by four lunch slots. One Sunday prep session covers the rest.

The headline readout on the admin week view is coverage: dinners filled out of 5, lunch
portions covered out of 10. When Tyler raises a multiplier, the lunch bar fills. That
interaction is the product.

## Two kinds of cooking

Both are cook events. They differ only in what they produce.

1. **Recipe at a multiplier.** Chili at 3x. Produces `base_servings * multiplier` servings
   of a finished dish.
2. **Component batch.** Three pounds of shredded chicken, a tray of roasted vegetables.
   Marked `is_component = true`. Produces servings that are ingredients for lunches rather
   than a finished meal. A lunch built from components is component + sauce + carb.

Do not collapse these into one concept. Tyler uses both and they behave differently in
the grocery list and in what a lunch slot displays.

## Sauces

Store-bought sauces are how the same batch stops feeling like the same lunch four days
running. This is load-bearing, not a nice-to-have.

Every leftover lunch slot has an optional `sauce` field. Default rotation list:
chimichurri, teriyaki, chipotle mayo, pesto. Freeform text, not an enum.

When four lunch slots point at the same cook event, prompt to vary the sauce.

## Meal type labels

`recipes.meal_types` is an array, not a single value. Allowed values:

```
breakfast | lunch | dinner | snack | drink | dessert | side
```

Chili is both lunch and dinner. Sourdough waffles are breakfast and dessert. A single-value
column would force bad data.

Labeling is not the same as planning. The library holds every meal type, and the library
view filters on them. The week planner still only plans lunch and dinner slots. The Paprika
import will bring in breakfasts, drinks, and desserts whether or not they get planned, and
they need somewhere to live without polluting the dinner picker.

The dinner slot picker filters to recipes tagged `dinner`. The lunch picker filters to
`lunch`. Untagged recipes appear in both with a "needs a label" prompt, since the import
will not always infer a type.

## Time

Recipes carry `active_min` and `total_min` separately. Active time is what Tyler is
actually standing at the counter for. A 55 minute chili with 15 active minutes is a
different decision than 40 minutes of grilling onions.

Recipes also carry `scales_cheaply` (boolean). Doubling a pot of soup costs nothing extra
in active time. Doubling anything seared, grilled, or cooked in batches multiplies it.

```
displayed_active_min = scales_cheaply ? active_min : active_min * multiplier
displayed_total_min  = scales_cheaply ? total_min  : total_min  * multiplier
```

## Paprika integration

Tyler's recipes live in Paprika on his phone. This app is the planner; Paprika is the
kitchen reader. Two directions, both using schema.org.

**Out (app to Paprika).** Every recipe page emits `schema.org/Recipe` JSON-LD in the
document head: `name`, `image`, `totalTime` (ISO 8601 duration), `recipeYield`,
`recipeIngredient` (array of strings), `recipeInstructions` (array of HowToStep).
From Safari, Share to Paprika imports it clean. Build one recipe page and verify the
share sheet works before building anything else on top of this.

**In (Paprika to app).** Paprika offers two export formats. Use **Paprika Recipe Format**
(`.paprikarecipes`), a ZIP archive of gzipped JSON files, one per recipe. The HTML export
exists as a human-readable backup only; do not parse it unless the JSON path fails.

Write a one-time import script at `scripts/import-paprika.ts` that reads the archive and
seeds the database. Map Paprika ingredient lines into structured rows where parseable and
preserve the original line in `raw_text` either way. Infer `meal_types` from Paprika
categories where possible and leave empty otherwise rather than guessing.

Add `*.paprikarecipes` and `*.html` exports to `.gitignore`. The archive is personal data
and can be large.

**Also in (web to app).** Paste a recipe URL, fetch it, parse the same JSON-LD, prefill
the add-recipe form. Most food blogs emit it. This is what saves Tyler from data entry.

## Auth

No accounts, no email, no magic-link email flow. Two people, both trusted.

- `HOUSEHOLD_PASSWORD` env var. Entered once, sets a signed httpOnly cookie with a long
  expiry. Never asked again on that device.
- `ADMIN_PASSWORD` env var. Upgrades the same cookie to admin. Admin unlocks the recipe
  library, week editing, and grocery generation.
- Charity gets in via a signed token in a URL (`/vote/<token>`), which sets the household
  cookie on arrival. She never types a password. The Ping Charity button generates the
  message containing this link.

That is the entire auth system. Do not add Supabase Auth, do not add roles tables, do not
add password reset.

## Schema

```sql
recipes
  id uuid pk
  title text not null
  meal_types text[] default '{}'   -- see Meal type labels below
  source_name text            -- 'NYT Cooking', 'Paprika import', 'House recipe'
  source_url text
  image_path text             -- Supabase Storage path
  active_min int
  total_min int
  base_servings int not null default 4
  scales_cheaply bool default true
  reheats_well bool default false     -- gates lunch candidacy. critical.
  kids_like bool default false
  is_component bool default false
  notes text
  last_made_at date
  created_at timestamptz default now()

ingredients
  id uuid pk
  recipe_id uuid fk -> recipes on delete cascade
  sort_order int
  qty numeric
  unit text                   -- '', 'lb', 'cups', 'cloves', 'g', ...
  item text not null
  aisle text                  -- Produce | Meat | Dairy | Pantry | Frozen | Bakery
  is_pantry_staple bool default false
  raw_text text               -- original line, preserved for export fidelity

steps
  id uuid pk
  recipe_id uuid fk -> recipes on delete cascade
  sort_order int
  body text

ratings
  recipe_id uuid fk -> recipes on delete cascade
  who text check (who in ('tyler','charity'))
  stars int check (stars between 1 and 5)
  updated_at timestamptz
  primary key (recipe_id, who)

weeks
  id uuid pk
  start_date date unique      -- Monday
  created_at timestamptz

cook_events                   -- the supply side
  id uuid pk
  week_id uuid fk -> weeks on delete cascade
  recipe_id uuid fk -> recipes
  multiplier int default 1 check (multiplier between 1 and 8)
  day text                    -- mon..sun
  kind text check (kind in ('dinner','prep'))
  -- produced = recipes.base_servings * multiplier
  -- reserved = (kind = 'dinner') ? DINNER_SERVINGS : 0

slots                         -- the demand side
  id uuid pk
  week_id uuid fk -> weeks on delete cascade
  day text                    -- mon..sun
  meal text check (meal in ('lunch','dinner'))
  fill_type text check (fill_type in ('cook','leftover','out'))
  cook_event_id uuid fk -> cook_events on delete cascade   -- cook | leftover
  out_label text                                           -- 'Costco pizza', 'Out to dinner'
  sauce text                                               -- leftover lunches only
  unique (week_id, day, meal)

suggestions
  id uuid pk
  week_id uuid fk -> weeks on delete cascade
  recipe_id uuid fk -> recipes
  sort_order int
  note text                   -- 'have frozen chicken to use up'

votes
  suggestion_id uuid fk -> suggestions on delete cascade
  who text check (who in ('tyler','charity'))
  vote text check (vote in ('yes','sure','pass'))
  primary key (suggestion_id, who)

grocery_checks
  week_id uuid fk -> weeks on delete cascade
  item_key text               -- normalized 'item|unit'
  checked bool default false
  primary key (week_id, item_key)
```

Note the `on delete cascade` from `cook_events` to `slots`. Deleting a dinner cook must
clear the lunches that depended on it rather than leaving them pointing at nothing.

### Ledger math

```
produced  = recipe.base_servings * cook_event.multiplier
reserved  = kind == 'dinner' ? DINNER_SERVINGS : 0
claimed   = count(slots where cook_event_id = this and fill_type = 'leftover') * LUNCH_SERVINGS
available = produced - reserved - claimed
```

`available` going negative means overcommitted. Surface it on the slot in red rather than
silently allowing it.

Auto-fill lunches: walk empty lunch slots in day order, claim from cook events where
`available >= LUNCH_SERVINGS` and `recipe.reheats_well = true`, preferring the event with
the most available. Never auto-fill from a recipe that doesn't reheat.

## Grocery list

Select which cook events to shop for, then generate. Merge ingredients across selected
events by `item|unit`, scaling each by its cook event's multiplier. Group by aisle.
Pantry staples go in a separate collapsed section since Tyler usually has them.
Checkbox state persists to `grocery_checks` so he can shop across two trips.
Include a "copy as plain text" action.

## Cost

Costs are ingredient-driven and reused. A shared `ingredient_prices` catalog stores a
unit price per normalized `item|unit` key (same key the grocery merge uses). Price an
ingredient once and every recipe containing it inherits the price.

```
line cost     = ingredient.qty * unit_price[item|unit]
recipe cost   = sum of its line costs (base batch); lines with no price are flagged, not guessed
cook cost     = recipe cost * multiplier
cost/serving  = cook cost / produced
```

The weekly readout splits spend the way coverage does. A cook's cost is fixed once you
buy for it; assigning its servings to more lunch slots does not add cost, it spreads the
same cost across more meals and lowers cost per meal. That is the interaction: raise a
multiplier and the lunch bar fills while lunch dollars stay modest.

```
dinner spend  = sum over cooks of cost/serving * servings consumed by dinner slots
lunch spend   = sum over cooks of cost/serving * servings consumed by lunch slots
unallocated   = cooked-but-unclaimed servings * cost/serving
```

Weekly budgets (`weekly_dinner_budget`, `weekly_lunch_budget`) live in `app_settings` and
are editable in the UI. Out slots (Costco pizza, eating out) carry no recipe cost. Prices
are entered inline on the grocery list and read server-side with the secret key.

## AI suggestions

Two optional AI features, gated on `ANTHROPIC_API_KEY` (server-only). When unset, the
controls are hidden and the app behaves exactly as before. Model: Claude Sonnet 4.6.

**The model proposes; the backend verifies.** The model never computes portions or decides
coverage. It returns recipe ids, multipliers, and day placements via a forced tool call
(strict schema); server code validates every id against the library and rejects anything
malformed, then the existing portion ledger (`computeCoverage`/`computeLedger`) decides
coverage. Nothing an AI produced becomes a real cook event without a tap.

- **Generate Week** (`generateWeek`/`acceptProposals` in `ai-actions.ts`): a "Generate
  plan" button on the week view proposes cooks + multipliers to fill empty dinners and
  close the lunch gap, respecting locked cooks and Friday pizza. Renders as a draft; accept
  all / accept one / regenerate; accepting commits cooks and runs the lunch auto-fill.
- **Charity's Swap** (`swapSlot`/`applySwap`): a swap control on filled dinner slots (week
  page and vote page) returns 3 alternatives; picking one replaces the slot and re-runs
  auto-fill to keep coverage intact.
- **Meal-ideas chat** (`planChat`): a collapsible brainstorm chat on the week view. Given
  the week's open slots + library + preferences, it riffs on freeform prompts ("sirloin's
  on sale, ideas?") with concrete dinner/lunch ideas mapped to open days. Advisory only —
  it doesn't change the plan. Multi-turn, client-side conversation state, plain-text replies.

Engine lives in `src/lib/ai/` (client, context, prompt, validate). Context = plannable
library + last 3 weeks of cook history + current week state, assembled server-side from
Supabase and sent as prompt context. Draft state is client-side only (no persistence).

## Family food preferences

Use these to filter suggestions and to inform any recipe Claude proposes.

Include: red meat (ground beef, steak, pot roast), chicken, turkey, fish, shrimp, eggs.
Real cheese and butter. Vegetables as sides, in stir-fries, in soups, or mixed in.
Generous healthy fats (olive oil, avocado, nuts, seeds, grass-fed butter).
Mostly whole and minimally processed ingredients. White flour and some white sugar are fine.
Frozen pre-chopped vegetables are welcome as a time saver.
Onions are loved, especially grilled, but grilling them is slow so it can't be weekly.

Exclude, as hard filters not soft preferences:
- Large salads as a main meal
- Greek yogurt
- Cottage cheese
- Ghee
- Heavily processed convenience food

Out of scope for **planning**: breakfast, snacks, desserts, drinks. No slots, no coverage
targets, no grocery generation for them. They exist in the library as labeled recipes only
(see Meal type labels).

Sourdough shows up in the recipe library like any other recipe. Do not build day-before
dependency tracking. Pizza night is usually Costco right now.

## Build order

Ship each phase to Vercel and confirm it works before starting the next. Do not build
ahead.

1. Supabase project, schema migration, seed 3 recipes by hand. Recipe list and detail
   pages. No auth yet.
2. JSON-LD on the recipe detail page. Open it on Tyler's phone, Share to Paprika, confirm
   the import is clean. **If this doesn't work, stop and rethink before building further.**
3. Paprika `.paprikarecipes` importer. Load the real library.
4. Auth: household cookie, admin upgrade.
5. Week view: slots, cook events, multipliers, coverage meters, auto-fill lunches.
6. Grocery list generation.
7. Suggestions, Charity's voting view, the vote token link, Ping Charity message.
8. Photo upload to Supabase Storage. Resize to max 1200px on upload; a 1 GB free tier
   disappears fast if 3 MB phone originals go straight through.
9. Recipe import from URL.

## Constraints and gotchas

- Mobile first. Charity votes on her phone. Tyler reads the week in the kitchen on his
  phone. The desktop layout is secondary.
- Supabase free tier pauses a project after 7 days of no requests. Weekly use sits close
  to that line. If it becomes annoying, add a scheduled ping, not a paid plan.
- Do not add: nutrition tracking, multi-household support, notifications,
  a native app, or an ingredient-substitution engine.
- Tyler prefers no em dashes in any user-facing copy.
