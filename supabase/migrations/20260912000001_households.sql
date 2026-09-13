-- Multi-household. One app, one database. Each household owns its OWN recipe
-- library, weekly plans, prices, and settings. Mom's library is seeded as a
-- one-time copy of Leber's and then evolves independently. See CLAUDE.md >
-- Households. This reverses the earlier "no multi-household support" note.
--
-- households.id is a text slug ('leber','mom') and is the same value carried in
-- the session cookie, so household scoping needs no id lookup anywhere.

create table if not exists households (
  id             text primary key,
  name           text not null,                    -- shown in the app header
  voting_enabled bool not null default true,        -- Charity's vote/record flow
  created_at     timestamptz not null default now()
);

insert into households (id, name, voting_enabled) values
  ('leber', 'Leber Family', true),
  ('mom',   'Mom',          false)
on conflict (id) do nothing;

-- Only the three tables that anchor a household carry household_id. cook_events,
-- slots, suggestions, votes and grocery_checks hang off weeks by week_id and are
-- scoped transitively.
alter table weeks             add column if not exists household_id text references households(id) default 'leber';
alter table app_settings      add column if not exists household_id text references households(id) default 'leber';
alter table ingredient_prices add column if not exists household_id text references households(id) default 'leber';

-- Backfill every existing row to the Leber household.
update weeks             set household_id = 'leber' where household_id is null;
update app_settings      set household_id = 'leber' where household_id is null;
update ingredient_prices set household_id = 'leber' where household_id is null;

alter table weeks             alter column household_id set not null;
alter table app_settings      alter column household_id set not null;
alter table ingredient_prices alter column household_id set not null;

-- Uniqueness moves from global to per-household.
alter table weeks drop constraint if exists weeks_start_date_key;
create unique index if not exists weeks_household_start_idx on weeks(household_id, start_date);

alter table app_settings drop constraint if exists app_settings_pkey;
alter table app_settings add primary key (household_id, key);

alter table ingredient_prices drop constraint if exists ingredient_prices_pkey;
alter table ingredient_prices add primary key (household_id, item_key);

-- Recipes are owned by a household. ingredients/steps/ratings cascade from a
-- recipe, so they inherit its household without their own column.
alter table recipes add column if not exists household_id text references households(id) default 'leber';
update recipes set household_id = 'leber' where household_id is null;
alter table recipes alter column household_id set not null;
create index if not exists recipes_household_idx on recipes(household_id);

-- Mom rates her own recipe copies too.
alter table ratings drop constraint if exists ratings_who_check;
alter table ratings add constraint ratings_who_check check (who in ('tyler','charity','mom'));
alter table votes   drop constraint if exists votes_who_check;
alter table votes   add constraint votes_who_check check (who in ('tyler','charity','mom'));

-- Seed Mom's library as a one-time copy of Leber's recipes (with their
-- ingredients and steps). Copies share the same image_path — recipe deletes
-- never remove the storage object, so that is safe. last_made_at resets: Mom's
-- cooking history is her own. Ratings are personal and are not copied.
-- Idempotent: skipped once Mom has any recipe.
do $$
declare
  r record;
  new_id uuid;
begin
  if exists (select 1 from recipes where household_id = 'mom') then
    return;
  end if;
  create temporary table _seed_map (old_id uuid, new_id uuid) on commit drop;
  for r in select * from recipes where household_id = 'leber' loop
    insert into recipes (
      title, meal_types, source_name, source_url, image_path, active_min,
      total_min, base_servings, scales_cheaply, reheats_well, kids_like,
      is_component, notes, last_made_at, flat_cost, household_id
    ) values (
      r.title, r.meal_types, r.source_name, r.source_url, r.image_path, r.active_min,
      r.total_min, r.base_servings, r.scales_cheaply, r.reheats_well, r.kids_like,
      r.is_component, r.notes, null, r.flat_cost, 'mom'
    ) returning id into new_id;
    insert into _seed_map values (r.id, new_id);
  end loop;

  insert into ingredients (recipe_id, sort_order, qty, unit, item, aisle, is_pantry_staple, raw_text)
  select m.new_id, i.sort_order, i.qty, i.unit, i.item, i.aisle, i.is_pantry_staple, i.raw_text
  from ingredients i join _seed_map m on m.old_id = i.recipe_id;

  insert into steps (recipe_id, sort_order, body)
  select m.new_id, s.sort_order, s.body
  from steps s join _seed_map m on m.old_id = s.recipe_id;
end $$;

-- Per-household settings: servings, weekly targets, budgets. Leber keeps the
-- historical constants as explicit rows so the code reads both households the
-- same way. Mom starts at three adults; she can edit these in the UI.
insert into app_settings (household_id, key, value) values
  ('leber','dinner_servings',      '4'),
  ('leber','lunch_servings',       '2'),
  ('leber','target_dinners',       '5'),
  ('leber','target_lunches',       '5'),
  ('mom','dinner_servings',        '3'),
  ('mom','lunch_servings',         '3'),
  ('mom','target_dinners',         '5'),
  ('mom','target_lunches',         '5'),
  ('mom','weekly_dinner_budget',   '150'),
  ('mom','weekly_lunch_budget',    '60')
on conflict (household_id, key) do nothing;

-- RLS: households is read with the publishable key for the header, and is not
-- sensitive. Everything else keeps the existing server-side-write posture.
alter table households enable row level security;
create policy "public read households" on households for select using (true);
