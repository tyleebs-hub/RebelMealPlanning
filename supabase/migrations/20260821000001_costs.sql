-- Phase 10: ingredient costs + weekly food budget.
-- See CLAUDE.md > Cost.

-- Shared price catalog. One unit price per normalized 'item|unit' key (the same
-- key the grocery merge uses), so pricing an ingredient once applies everywhere.
create table if not exists ingredient_prices (
  item_key   text primary key,                          -- 'item|unit', lowercased
  item       text,                                       -- display label
  unit       text,                                       -- display unit ('' = count/each)
  unit_price numeric not null check (unit_price >= 0),   -- dollars per single unit
  updated_at timestamptz default now()
);

-- Simple key/value settings (weekly budgets for now).
create table if not exists app_settings (
  key   text primary key,
  value text
);

insert into app_settings (key, value) values
  ('weekly_dinner_budget', '150'),
  ('weekly_lunch_budget',  '60')
on conflict (key) do nothing;

-- Prices and settings are read and written server-side with the secret key,
-- which bypasses RLS. RLS on with no public policy => the publishable key has
-- no access, matching the write-side tables.
alter table ingredient_prices enable row level security;
alter table app_settings      enable row level security;
