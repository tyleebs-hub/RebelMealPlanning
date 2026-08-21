-- Meal Planner initial schema
-- Faithful to CLAUDE.md. Cook events produce servings; slots consume them.
-- Phase 1 uses recipes / ingredients / steps; the rest are created now so the
-- "schema migration" step is complete and later phases don't re-migrate.

-- recipes ---------------------------------------------------------------------
create table if not exists recipes (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  meal_types     text[] not null default '{}',   -- breakfast|lunch|dinner|snack|drink|dessert|side
  source_name    text,                            -- 'NYT Cooking', 'Paprika import', 'House recipe'
  source_url     text,
  image_path     text,                            -- Supabase Storage path
  active_min     int,
  total_min      int,
  base_servings  int not null default 4,
  scales_cheaply bool not null default true,
  reheats_well   bool not null default false,     -- gates lunch candidacy. critical.
  kids_like      bool not null default false,
  is_component   bool not null default false,
  notes          text,
  last_made_at   date,
  created_at     timestamptz not null default now()
);

-- ingredients -----------------------------------------------------------------
create table if not exists ingredients (
  id               uuid primary key default gen_random_uuid(),
  recipe_id        uuid not null references recipes(id) on delete cascade,
  sort_order       int,
  qty              numeric,
  unit             text,                           -- '', 'lb', 'cups', 'cloves', 'g', ...
  item             text not null,
  aisle            text,                           -- Produce|Meat|Dairy|Pantry|Frozen|Bakery
  is_pantry_staple bool not null default false,
  raw_text         text                            -- original line, preserved for export fidelity
);
create index if not exists ingredients_recipe_id_idx on ingredients(recipe_id);

-- steps -----------------------------------------------------------------------
create table if not exists steps (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references recipes(id) on delete cascade,
  sort_order int,
  body       text
);
create index if not exists steps_recipe_id_idx on steps(recipe_id);

-- ratings ---------------------------------------------------------------------
create table if not exists ratings (
  recipe_id  uuid not null references recipes(id) on delete cascade,
  who        text not null check (who in ('tyler','charity')),
  stars      int check (stars between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (recipe_id, who)
);

-- weeks -----------------------------------------------------------------------
create table if not exists weeks (
  id         uuid primary key default gen_random_uuid(),
  start_date date not null unique,                 -- Monday
  created_at timestamptz not null default now()
);

-- cook_events (the supply side) ----------------------------------------------
create table if not exists cook_events (
  id         uuid primary key default gen_random_uuid(),
  week_id    uuid not null references weeks(id) on delete cascade,
  recipe_id  uuid not null references recipes(id),
  multiplier int not null default 1 check (multiplier between 1 and 8),
  day        text,                                 -- mon..sun
  kind       text check (kind in ('dinner','prep'))
  -- produced = recipes.base_servings * multiplier
  -- reserved = (kind = 'dinner') ? DINNER_SERVINGS : 0
);
create index if not exists cook_events_week_id_idx on cook_events(week_id);

-- slots (the demand side) -----------------------------------------------------
create table if not exists slots (
  id            uuid primary key default gen_random_uuid(),
  week_id       uuid not null references weeks(id) on delete cascade,
  day           text,                              -- mon..sun
  meal          text check (meal in ('lunch','dinner')),
  fill_type     text check (fill_type in ('cook','leftover','out')),
  cook_event_id uuid references cook_events(id) on delete cascade,  -- cook | leftover
  out_label     text,                              -- 'Costco pizza', 'Out to dinner'
  sauce         text,                              -- leftover lunches only
  unique (week_id, day, meal)
);
create index if not exists slots_week_id_idx on slots(week_id);
create index if not exists slots_cook_event_id_idx on slots(cook_event_id);

-- suggestions -----------------------------------------------------------------
create table if not exists suggestions (
  id         uuid primary key default gen_random_uuid(),
  week_id    uuid not null references weeks(id) on delete cascade,
  recipe_id  uuid not null references recipes(id),
  sort_order int,
  note       text                                  -- 'have frozen chicken to use up'
);
create index if not exists suggestions_week_id_idx on suggestions(week_id);

-- votes -----------------------------------------------------------------------
create table if not exists votes (
  suggestion_id uuid not null references suggestions(id) on delete cascade,
  who           text not null check (who in ('tyler','charity')),
  vote          text check (vote in ('yes','sure','pass')),
  primary key (suggestion_id, who)
);

-- grocery_checks --------------------------------------------------------------
create table if not exists grocery_checks (
  week_id  uuid not null references weeks(id) on delete cascade,
  item_key text not null,                          -- normalized 'item|unit'
  checked  bool not null default false,
  primary key (week_id, item_key)
);

-- Row Level Security ----------------------------------------------------------
-- The app has no Supabase Auth (see CLAUDE.md > Auth); it uses the publishable
-- key, which is visible in the browser. So: RLS on for every table, and the
-- public key gets READ-ONLY access to the recipe tables it renders directly.
-- Writes (weeks, cook_events, slots, votes, etc.) go through server-side code
-- using the secret key, which bypasses RLS. Those policies arrive with their
-- phases; until then those tables are locked to the public key.

alter table recipes         enable row level security;
alter table ingredients     enable row level security;
alter table steps           enable row level security;
alter table ratings         enable row level security;
alter table weeks           enable row level security;
alter table cook_events     enable row level security;
alter table slots           enable row level security;
alter table suggestions     enable row level security;
alter table votes           enable row level security;
alter table grocery_checks  enable row level security;

-- Phase 1: public read of the library.
create policy "public read recipes"     on recipes     for select using (true);
create policy "public read ingredients" on ingredients for select using (true);
create policy "public read steps"       on steps       for select using (true);
