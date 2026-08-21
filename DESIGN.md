# DESIGN.md

Visual and interaction spec for the meal planner frontend. Read alongside CLAUDE.md.
CLAUDE.md defines what the app does. This file defines how it looks and how it feels to use.

A reference implementation lives at `reference/prototype.jsx`. Read it for layout, color
usage, and component structure. **Do not copy its state management or mock data.** It is a
standalone mock with everything in `useState`. This app reads from Supabase. Take the
design, leave the plumbing.

---

## Hard guardrails

The backend is verified and working. Do not put it at risk for a visual change.

**Do not touch:**
- Anything in `supabase/` (migrations, schema, RLS policies)
- Any query or data-fetching logic, including the shape of what comes back
- Environment variables or the Supabase client setup
- The auth cookie logic

**Do:**
- Keep pages as server components. Add `"use client"` only to the specific interactive
  leaf components that need it (steppers, pickers, checkboxes). Do not convert a whole
  page to a client component to make one button work.
- Use `next/font` for fonts. Do not use `@import` in a CSS file; it blocks render.
- Use plain Tailwind and CSS variables. Do not add shadcn, Radix, Framer Motion, or any
  component library. Every dependency added is a dependency to maintain alone.

**Work in the order given under Build order below.** Commit and deploy after each step,
and confirm the page still renders real data from Supabase before starting the next.
If a step breaks data loading, stop and revert that step rather than pushing forward.

---

## The interaction model is the real fix

The current UI has a "Cooks this week" form above a passive week grid. Adding a cook means
filling out a form with a day dropdown, then finding the result elsewhere on the page.
That is backwards.

**Replace it with slot-first planning:**

1. Every slot in the week grid is tappable. Empty slots read `+ Dinner` or `+ Lunch`.
2. Tapping an empty **dinner** slot opens a picker sheet with three options: cook a recipe
   (searchable list, filtered to `meal_types` containing `dinner`), a quick "no cook"
   option (Costco pizza, Out to dinner, Leftovers), or nothing.
3. Tapping an empty **lunch** slot opens a picker that leads with **what is already
   cooking**: every cook event with `available >= LUNCH_SERVINGS` and
   `reheats_well = true`, shown with how many portions are free. Below that, the option to
   cook something fresh or mark it as out.
4. Choosing a recipe creates the cook event on that day at 1x. The multiplier stepper then
   lives **on the filled slot itself**, not in a separate form.
5. Prep and component cooks keep a dedicated strip below the week grid, since they are not
   tied to a meal slot. That section is correct as a separate area. The dinner form is not.

Delete the standalone "Add cook" form entirely once slots can create cooks.

**Color tracing is the signature interaction.** Each cook event gets a hue. The dinner
slot that produces the portions and every lunch slot that consumes them share that hue as
a 4px left border. Looking at the week, you can see at a glance that Tuesday and Wednesday
lunch are both riding on Monday's chili. This is the single most important visual element
in the app. Build it before anything else cosmetic.

Assign hues by cook event index within the week, cycling through the five below. Do not
store hue in the database.

---

## Palette

```css
--paper:  #EDF0EB;   /* page background, pale sage */
--card:   #FBFCFA;   /* card surfaces */
--ink:    #16201B;   /* primary text, deep pine */
--ink2:   #5A6961;   /* secondary text */
--rule:   #D2DAD1;   /* borders */
--rule2:  #E3E8E1;   /* hairline dividers */
--amber:  #C97B18;   /* lunch coverage, cook badges, warnings */
--go:     #1C6E62;   /* dinner coverage, success, confirmations */
```

Cook event hues, each with a solid, a soft background, and a readable text tone:

```css
teal:  bg #1C6E62  soft #DCE9E6  text #0F4A41
amber: bg #C97B18  soft #F5E7D2  text #7F4C08
plum:  bg #7A4A63  soft #EBDDE4  text #4E2C3E
olive: bg #5F7233  soft #E3E9D6  text #3D4A1E
clay:  bg #B24D33  soft #F3DFD8  text #7A3020
```

Leftover lunch slots use their source's `soft` as a background fill. Cook slots use `card`
with the `bg` as the left border. That difference alone makes the supply and demand sides
readable without a legend.

Never use pure black (`#000`) or pure white (`#fff`) for surfaces or text.

---

## Type

Three faces, each with one job. Load via `next/font/google`.

- **Bricolage Grotesque** (800): page titles, day names, recipe titles in headers. Nothing
  else. Tight tracking, around `-0.025em`.
- **Instrument Sans** (400/500/600): all body text, buttons, labels.
- **DM Mono** (400/500): every number. Portion counts, multipliers, quantities, times,
  dates. Numbers in mono is what makes the coverage math read like a ledger instead of
  like prose.

Eyebrow labels (`DINNER`, `COOKS THIS WEEK`) are DM Mono, 10px, uppercase, `0.14em`
letter-spacing, in `--ink2`. Small and quiet, not bold grey shouting.

---

## Coverage meters

Currently two grey bars with no fill and no guidance. They should be the most alive element
on the page.

- Dinners fill in `--go`. Lunch portions fill in `--amber`.
- Animate width changes, around 350ms ease-out, so raising a multiplier visibly fills the
  lunch bar. That feedback loop is the whole product.
- Add a third readout: **unassigned portions**, the sum of `available` across all cook
  events. Cooked but unclaimed.
- Below the meters, when lunch coverage is short, show one line of actual guidance:
  "4 lunch portions short. You have 6 spare portions cooked, so assign them to a lunch
  slot." or "...Raise a dinner multiplier or add a prep session." Branch on whether spare
  portions exist. A number alone does not tell Tyler what to do next.
- Respect `prefers-reduced-motion`.

---

## Photos

Recipes need `image_path` rendering everywhere they appear: library cards, recipe detail
headers, and Charity's vote cards.

Until real photos exist, render a deterministic placeholder derived from the recipe hue:
a soft-tinted field with concentric circles and the recipe's first letter in Bricolage at
low opacity. See `DishArt` in the reference file. It should look like a deliberate design
choice, not a broken image.

---

## Layout

Mobile first. Tyler reads this in the kitchen on his phone; Charity votes on hers.

- **Mobile:** days stack vertically. Within a day, dinner and lunch sit side by side.
- **Desktop:** the seven days become columns via
  `grid-template-columns: repeat(auto-fit, minmax(148px, 1fr))`. Right now the desktop view
  is a narrow centered column of near-identical grey boxes, which wastes the space and makes
  the week hard to scan. The whole point of a week view is seeing the week at once.
- Pickers are bottom sheets on mobile, centered modals at `md` and up.
- Tap targets minimum 44px.

---

## Components to build

- `CoverageMeter` — label, value, target, color, animated fill
- `SlotCell` — handles all four states: empty, cook, leftover, out. Owns the hue border.
- `Stepper` — multiplier control, minus/value/plus, mono value
- `PickerSheet` — the slot picker described above, different content for lunch vs dinner
- `DishArt` — photo or generated placeholder
- `RecipeCard` — library grid card with art, title, times, both ratings, flags
- `Rating` — initial-in-circle plus mono number, one per person

---

## Build order

Deploy and verify after each step.

1. Fonts, CSS variables, palette. Nothing else changes. Confirm data still loads.
2. `SlotCell` with hue tracing and the four states. This is the highest-value change.
3. Slot-first picker. Delete the standalone "Add cook" form.
4. Coverage meters with fill, animation, and the guidance line.
5. `DishArt` and photo rendering across library, detail, and vote cards.
6. Desktop column layout for the week grid.
7. Recipe library and detail page polish.

Stop after step 2 and look at it before continuing. If the color tracing does not make the
week instantly readable, the rest of the styling will not save it.
