# Leber Family Meals — Project Brief

A private household meal planner for one family (two adults, two kids). Not a product —
optimized for two real users actually using it, not for generality. This brief describes
what it is, the domain model, the data schema, and every feature, so another engineer or
LLM can understand and extend it.

Live app is deployed on Vercel; every push to `main` ships.

---

## 1. Stack

- **Next.js (App Router)**, React 19, TypeScript. Server Components by default; `"use client"`
  only on interactive leaf components.
- **Server Actions** for all mutations (no REST API routes anywhere).
- **Supabase** Postgres (data) + Storage (dish photos). Two clients:
  - Publishable key (`NEXT_PUBLIC_...`) for public reads under RLS.
  - Secret key (`SUPABASE_SECRET_KEY`, server-only) via `getSupabaseAdmin()` for writes /
    RLS bypass. Never imported into client components.
- **Tailwind v4** (CSS-var design tokens; class-based light/dark). Mobile-first.
- **Anthropic SDK** (`@anthropic-ai/sdk`) for AI features (server-only, `ANTHROPIC_API_KEY`).
- **@dnd-kit/core** for drag-and-drop on the week view.
- No other UI/state libraries. State is React `useState` + server actions + `revalidatePath`.

---

## 2. The one idea that matters

Most meal planners assume one recipe fills one meal. This one doesn't. Tyler cooks once and
that cook feeds multiple slots across multiple days and both meal types.

**Cook events produce servings. Slots consume them.** A slot never owns a recipe directly —
it points at a cook event.

```
DINNER_SERVINGS = 4   // 2 adults + 2 kids
LUNCH_SERVINGS  = 2   // 2 adults
TARGET_DINNERS  = 5   // per week (other 2 nights are pizza/eating out)
TARGET_LUNCHES  = 5   // per week × 2 people = 10 portions
```

The headline readout is **coverage**: dinners filled out of 5, lunch portions covered out of
10. Raising a cook's multiplier fills the lunch bar — that interaction is the product.

### Two kinds of cooking (both are cook events)
1. **Recipe at a multiplier** — e.g. chili at 3× → `base_servings × multiplier` finished servings.
2. **Component batch** (`is_component`) — e.g. shredded chicken, roasted veg; ingredients for
   lunches rather than a finished meal.

### Ledger math
```
produced  = recipe.base_servings × cook_event.multiplier
reserved  = kind == 'dinner' ? DINNER_SERVINGS : 0
claimed   = (# leftover slots pointing at this cook) × LUNCH_SERVINGS
available = produced − reserved − claimed        // negative = overcommitted (shown red)
```

### Temporal rule (leftovers can't precede their cook)
A dinner cooked in the evening feeds packed lunches the **next day onward**; a prep batch
feeds lunches **from its own day**. `earliestLunchIndex(cook)` enforces this in auto-fill,
in the picker's leftover pool, and as a red "not made yet" warning on the grid.

---

## 3. Key domain concepts

- **Meal type labels** — `recipes.meal_types` is an array (`breakfast|lunch|dinner|snack|drink|
  dessert|side`). Chili is both lunch and dinner. The library holds every type; the week planner
  only plans lunch and dinner. Dinner picker filters to `dinner`; lunch picker to `lunch` (+
  untagged + components). Untagged recipes show in both with a "needs a label" prompt.
- **Time** — `active_min` (hands-on) and `total_min` are separate. `scales_cheaply` (bool): a
  pot of soup doubles for free; seared/grilled things multiply active time. Displayed time
  scales by multiplier when `!scales_cheaply`.
- **reheats_well** — gates lunch candidacy (critical). Auto-fill only pulls leftovers from
  reheatable cooks.
- **Sauces** — leftover lunch slots have an optional freeform `sauce` (chimichurri, teriyaki,
  chipotle mayo, pesto). When 4+ lunches share a cook, the UI nudges to vary the sauce.
- **Out slots** — "Costco pizza", "Out to dinner", etc. No recipe; flat cost only.
- **Custom plans** — enter a name + cost + servings on any slot (e.g. Domino's, $25, 6). Saved
  as a reheatable "Custom" recipe with a `flat_cost`, then cooked, so its leftovers feed lunches
  and its cost lands in the weekly total.

---

## 4. Data schema (Postgres / Supabase)

Migrations in `supabase/migrations/`. RLS on for every table; public key gets read-only on the
recipe library; all writes go through the secret key (bypasses RLS).

```
recipes(id, title, meal_types text[], source_name, source_url, image_path,
        active_min, total_min, base_servings, scales_cheaply, reheats_well,
        kids_like, is_component, flat_cost numeric, notes, last_made_at, created_at)
ingredients(id, recipe_id→recipes ON DELETE CASCADE, sort_order, qty numeric, unit,
            item, aisle, is_pantry_staple, raw_text)
steps(id, recipe_id→recipes CASCADE, sort_order, body)
ratings(recipe_id→recipes CASCADE, who 'tyler'|'charity', stars 1-5, updated_at)
weeks(id, start_date date unique /* Monday */, created_at)
cook_events(id, week_id→weeks CASCADE, recipe_id→recipes /* NO cascade */,
            multiplier 1-8, day 'mon'..'sun', kind 'dinner'|'prep')
slots(id, week_id→weeks CASCADE, day, meal 'lunch'|'dinner',
      fill_type 'cook'|'leftover'|'out', cook_event_id→cook_events CASCADE,
      out_label, sauce, unique(week_id, day, meal))
suggestions(id, week_id→weeks CASCADE, recipe_id→recipes /* NO cascade */, sort_order, note)
votes(suggestion_id→suggestions CASCADE, who 'tyler'|'charity', vote 'yes'|'sure'|'pass')
grocery_checks(week_id→weeks CASCADE, item_key /* 'item|unit' */, checked, pk(week_id,item_key))
ingredient_prices(item_key /* 'item|unit', pk */, item, unit, unit_price numeric, updated_at)
app_settings(key pk, value)   -- weekly_dinner_budget, weekly_lunch_budget
```

Note: `cook_events` and `suggestions` reference `recipes` WITHOUT cascade — deleting a recipe
must first clear those (they cascade to slots/votes). Deleting a dinner cook cascades to the
lunches that depended on it.

---

## 5. Features

### Recipe library
- List (`/recipes`) with client-side filters (meal type, active-time buckets, kid-friendly,
  reheats-well, search) and a live match count; fill-width responsive grid; dish photo or a
  generated placeholder (`DishArt`).
- Detail (`/recipes/[id]`) emits `schema.org/Recipe` JSON-LD (Share-to-Paprika works), photo
  upload, meal-type chips, time, estimated cost + cost/serving, tap-to-toggle flags
  (reheats/kids/scales), a "+ add to this week" quick-add, and Edit/Delete.
- Create/Edit (`/recipes/new`, `/recipes/[id]/edit`) share `RecipeForm`: title, meal types,
  times, servings, flags, ingredients (one per line, parsed), steps, source, notes. **URL
  import**: paste a recipe URL → fetch → parse JSON-LD → prefill → and **download the hero
  photo** into Storage on save. New/edited ingredients get an **inferred aisle + pantry-staple
  flag** (`src/lib/aisle.ts`).
- Delete clears dependent cook_events + suggestions first (FK-safe), then the recipe.

### Week planning (`/week/[start]`, `start` = Monday YYYY-MM-DD)
- 7-day grid; each day shows a **lunch slot on top, dinner slot on bottom** (fixed heights so
  rows align). Tap a slot → picker sheet (cook a recipe / assign leftover / out / **custom
  plan** / clear).
- **Coverage meters** (dinners/5, lunch portions/10, unassigned) and a **week total** cost line.
- **Multiplier stepper** on cook tiles; **hue tracing** — a dinner cook and its leftover lunches
  share a colored left border (derived, not stored).
- **Auto-fill lunches** — walks empty lunch days, claims from reheatable cooks with spare
  servings, respecting the temporal rule.
- **Drag-and-drop** (@dnd-kit, touch + mouse) — drag a dinner/lunch tile to another day to move
  or swap; moving a cook updates its `cook_event.day`; a leftover can't be dropped before its
  cook. Taps still open the picker (activation threshold).
- **Friday default**: new weeks seed a Friday dinner "out" slot = "Pizza / Movie Night" (overridable).
- **Charity's votes / suggestions** section (see below).

### Grocery (`/week/[start]/grocery`)
- Select which cook events to shop for → merge ingredients, scaling each by its multiplier.
- **Cross-unit aggregation**: same item, compatible units combine — 0.25 cup + 8 tbsp butter →
  0.75 cups; 1 lb + 8 oz → 1.5 lb; cloves add up. Count/each units merge only when identical.
- Grouped by aisle (Produce/Meat/Dairy/Bakery/Frozen/Pantry/Other), responsive multi-column,
  pantry staples in a collapsed section, checkbox state persisted, "copy as text".
- **Inline pricing**: enter what a line costs → derives a per-unit price → saved to the shared
  `ingredient_prices` catalog (reused across recipes). Live total + unpriced count. Week nav.

### Cost
- Ingredient-driven and reused. `recipe cost = Σ(qty × unit_price[item|unit])`; a recipe's
  `flat_cost` (custom plans) wins over the ingredient math. `cook cost = recipe cost ×
  multiplier`. Weekly total splits into dinner vs lunch spend by servings consumed; cooked-but-
  unclaimed servings are "unallocated". Out slots carry a flat cost (Costco $12, Domino's $25,
  Champ's $50, out-to-dinner $40, out-to-lunch $30, leftovers/home free — meal-aware).
- Weekly budgets live in `app_settings` (the current UI shows just the cumulative week total).

### Voting & suggestions (Charity's view, `/vote`)
- Default landing for everyone (Tyler clicks into admin). Charity votes (Yes!/Sure/Pass) on the
  recipes Tyler has drafted this week (derived from cook events; a suggestion row is lazily
  created per recipe to anchor votes). Progress bar, DishArt cards, read-only "the plan" table.
- **Suggest a recipe**: Charity pastes a recipe URL → imported into the library (dinner-labeled,
  ingredients + steps) → filed as a week suggestion + her yes vote. Surfaces on Tyler's week
  page under "Charity wants to try" (clears once he drafts it). Both pages have an ✕ to remove
  a suggestion, and a "not this →" AI swap on planned dinners.
- **Ping Charity**: generates a signed `/vote/<token>` link (passwordless entry) + a message.

### Photos
- Dish photos in Supabase Storage bucket `dish-photos`. Client-resized on manual upload; URL
  import downloads the source hero image server-side (SSRF-guarded, size-capped, best-effort).
  `DishArt` shows the photo or a generated hued placeholder.

---

## 6. AI features (optional, gated on `ANTHROPIC_API_KEY`)

Model: **Claude Sonnet 4.6** (`claude-sonnet-4-6`). Engine in `src/lib/ai/` (client, context,
prompt, validate). Hidden when the key is unset; app behaves exactly as before.

**Core principle: the model proposes; the backend verifies.** The model returns recipe ids,
multipliers, and day placements via a **forced strict tool call** — it never computes portions
or decides coverage. Server code validates every id against the library, rejects malformed
output (retry once), and the existing portion ledger decides coverage. Nothing commits without
a tap.

Context sent to the model = plannable library (id, title, meal types, times, flags, cost tier)
+ last 3 weeks of cook history + current week state, assembled server-side from Supabase. The
library is a cached prompt prefix.

Three features (`src/app/week/[start]/ai-actions.ts`):
1. **Generate Week** (`generateWeek`/`acceptProposals`) — proposes cooks + multipliers to fill
   empty dinners and close the lunch gap, respecting locked cooks and Friday pizza. Renders as a
   draft: accept all / accept one / regenerate. Accepting commits + runs auto-fill.
2. **Charity's Swap** (`swapSlot`/`applySwap`) — on a filled dinner (week page + vote page),
   returns 3 alternatives sized to hold the same lunch coverage; picking one replaces the slot
   and re-runs auto-fill.
3. **Meal-ideas chat** (`planChat`, actionable) — a collapsible brainstorm chat grounded in the
   week's open slots. Freeform prompts ("sirloin's on sale, ideas?") → concrete ideas mapped to
   open days with lunch-reheat notes. It can surface **Add buttons** (via a `suggest_meals`
   tool): a library recipe drops into the slot; a new dish is saved to the library (with
   ingredients/steps/aisles) and then cooked. Multi-turn, client-side conversation, plain-text
   replies.

---

## 7. Auth

No accounts, no email, no third-party provider. Two trusted people.
- One shared `HOUSEHOLD_PASSWORD`, entered once → signed httpOnly cookie (~400-day expiry) via
  HMAC-SHA256 (Web Crypto, works in Edge middleware + Node actions). Never asked again on a
  device. No admin tier.
- The cookie carries an identity `who` (`tyler`|`charity`), used for authorship/votes, not
  permissions.
- Charity enters via a signed `/vote/<token>` link (handled in middleware; sets the cookie).
- Sign-out is a POST server action (a GET route was removed because Next prefetched it and
  logged users out).

---

## 8. Paprika integration (recipe interchange)

Recipes live in Paprika on Tyler's phone; this app is the planner.
- **Out**: every recipe page emits `schema.org/Recipe` JSON-LD → Safari Share-to-Paprika.
- **In (bulk)**: one-time importer `scripts/import-paprika.ts` reads a `.paprikarecipes` ZIP
  (gzipped JSON per recipe) and seeds the DB; `scripts/backfill-paprika-photos.ts` uploaded the
  embedded photos.
- **In (web)**: paste a recipe URL → parse the same JSON-LD → prefill the add-recipe form.

---

## 9. Env vars & external setup

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY   # client-safe read key
SUPABASE_SECRET_KEY                    # server-only writes
AUTH_SECRET                            # signs the session cookie
HOUSEHOLD_PASSWORD                     # the one shared password
ANTHROPIC_API_KEY                      # optional; enables AI features
```

Migrations are applied by hand in the Supabase SQL editor (the tooling's Supabase MCP can't
reach this personal project). Storage bucket `dish-photos` is public-read.

---

## 10. File map (src/)

```
app/
  page.tsx                     -> redirects to /vote (or /login)
  login/, logout/              auth
  week/[start]/
    page.tsx                   the planner (server)
    actions.ts                 cook/slot/leftover/out/custom/move/auto-fill actions
    ai-actions.ts              generateWeek, acceptProposals, swapSlot, applySwap, planChat, addChatMeal
    grocery/{page,actions}.ts  grocery list + pricing
  recipes/                     library, detail, new, [id]/edit, delete/flag actions
  vote/page.tsx                Charity's voting + suggest view
components/
  week/                        WeekGrid, PickerSheet, CoverageMeters, CostPanel, MultiplierStepper,
                               GeneratePlan, SwapSheet, PlanChat, QuickAdd, SuggestRecipe, VoteButtons, PingCharity
  RecipeForm, RecipeLibraryGrid, RecipeFilterBar, RecipeFlagToggles, DishArt, PhotoUpload, AppHeader, ThemeToggle
lib/
  week.ts        domain types, DAYS, ledger (computeLedger/computeCoverage), earliestLunchIndex
  week-data.ts   loadWeek, loadSuggestions, weekIdForStart (seeds Friday pizza on new weeks)
  types.ts       constants (DINNER_SERVINGS...), Recipe/Ingredient/Step types
  grocery.ts     buildGroceryList (merge + cross-unit aggregation)
  cost.ts        recipeCost, weeklyCost, money, outCost (meal-aware)
  cost-data.ts   loadPrices, loadBudgets
  aisle.ts       inferAisleAndStaple (grocery aisle from ingredient name)
  ingredient-parse.ts, recipe-jsonld-parse.ts, jsonld.ts, import-image.ts, storage.ts, hues.ts
  recipe-filter.ts  shared library/picker filter logic
  ai/{client,context,prompt,validate}.ts   the AI engine
  auth.ts, session.ts, supabase/{admin,server}.ts
middleware.ts    auth gate + /vote/<token> handling
```

---

## 11. Constraints / non-goals

- Mobile first (both users plan/vote on phones).
- No em dashes in user-facing copy.
- Deliberately NOT built: nutrition tracking, multi-household support, notifications, a native
  app, ingredient-substitution engine, day-before sourdough dependency tracking.
- Costs and AI plans are estimates; a chat-invented recipe's ingredients are a best guess, not
  a tested recipe.

---

## 12. Conventions for extending

- Mutations = server actions with `requireAuth()` + `revalidatePath`. Reads in server components.
- Reuse the ledger (`computeCoverage`/`computeLedger`) — never recompute coverage ad hoc.
- New ingredients should run through `inferAisleAndStaple` so grocery grouping stays clean.
- AI additions: model proposes via a strict tool; server validates against the real library and
  ledger before anything renders or commits.
- The canonical spec lives in `CLAUDE.md`; this brief summarizes the built state.
