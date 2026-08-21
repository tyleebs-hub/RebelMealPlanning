-- Seed: 3 hand-written recipes for phase 1.
-- Chosen to exercise the model: a lunch+dinner hero that scales cheaply and
-- reheats, a sheet-pan dinner, and a component batch (is_component).
-- All within the family food preferences in CLAUDE.md.
-- Idempotent: clears the three seeded recipes first (cascades to their rows).

delete from recipes where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);

-- 1) Weeknight Beef Chili -----------------------------------------------------
insert into recipes (id, title, meal_types, source_name, active_min, total_min,
  base_servings, scales_cheaply, reheats_well, kids_like, is_component, notes)
values (
  '11111111-1111-1111-1111-111111111111',
  'Weeknight Beef Chili',
  '{lunch,dinner}',
  'House recipe',
  15, 55, 4, true, true, true, false,
  'The workhorse. Cook at 3x on Monday: 4 for dinner, 8 packaged for the week''s lunches.'
);

insert into ingredients (recipe_id, sort_order, qty, unit, item, aisle, is_pantry_staple, raw_text) values
  ('11111111-1111-1111-1111-111111111111', 1, 2,    'lb',   'ground beef',           'Meat',    false, '2 lb ground beef (85/15)'),
  ('11111111-1111-1111-1111-111111111111', 2, 1,    '',     'yellow onion, diced',   'Produce', false, '1 large yellow onion, diced'),
  ('11111111-1111-1111-1111-111111111111', 3, 3,    'cloves','garlic, minced',       'Produce', false, '3 cloves garlic, minced'),
  ('11111111-1111-1111-1111-111111111111', 4, 2,    'tbsp', 'chili powder',          'Pantry',  true,  '2 tbsp chili powder'),
  ('11111111-1111-1111-1111-111111111111', 5, 1,    'tbsp', 'ground cumin',          'Pantry',  true,  '1 tbsp ground cumin'),
  ('11111111-1111-1111-1111-111111111111', 6, 1,    'can',  'crushed tomatoes (28oz)','Pantry', false, '1 (28 oz) can crushed tomatoes'),
  ('11111111-1111-1111-1111-111111111111', 7, 2,    'can',  'kidney beans, drained', 'Pantry',  false, '2 (15 oz) cans kidney beans, drained and rinsed'),
  ('11111111-1111-1111-1111-111111111111', 8, 1,    'tbsp', 'olive oil',             'Pantry',  true,  '1 tbsp olive oil'),
  ('11111111-1111-1111-1111-111111111111', 9, null, '',     'salt and pepper',       'Pantry',  true,  'Salt and pepper to taste'),
  ('11111111-1111-1111-1111-111111111111',10, 1,    'cup',  'shredded cheddar',      'Dairy',   false, '1 cup shredded sharp cheddar, to serve');

insert into steps (recipe_id, sort_order, body) values
  ('11111111-1111-1111-1111-111111111111', 1, 'Heat olive oil in a large pot over medium-high. Add onion and cook until soft, about 5 minutes.'),
  ('11111111-1111-1111-1111-111111111111', 2, 'Add ground beef, breaking it up, and brown. Stir in garlic, chili powder, and cumin and cook 1 minute until fragrant.'),
  ('11111111-1111-1111-1111-111111111111', 3, 'Add crushed tomatoes and beans. Season with salt and pepper. Bring to a simmer.'),
  ('11111111-1111-1111-1111-111111111111', 4, 'Reduce heat and simmer uncovered 35-40 minutes, stirring occasionally, until thickened. Serve topped with cheddar.');

-- 2) Sheet-Pan Chicken Thighs and Broccoli ------------------------------------
insert into recipes (id, title, meal_types, source_name, active_min, total_min,
  base_servings, scales_cheaply, reheats_well, kids_like, is_component, notes)
values (
  '22222222-2222-2222-2222-222222222222',
  'Sheet-Pan Chicken Thighs and Broccoli',
  '{dinner}',
  'House recipe',
  10, 40, 4, false, true, true, false,
  'Bone-in thighs stay juicy. Broccoli roasts alongside. Does not scale cheaply: a second sheet pan means a second rack and a longer cook.'
);

insert into ingredients (recipe_id, sort_order, qty, unit, item, aisle, is_pantry_staple, raw_text) values
  ('22222222-2222-2222-2222-222222222222', 1, 8,   '',     'bone-in chicken thighs','Meat',    false, '8 bone-in, skin-on chicken thighs'),
  ('22222222-2222-2222-2222-222222222222', 2, 1,   'lb',   'broccoli florets',      'Produce', false, '1 lb broccoli, cut into florets'),
  ('22222222-2222-2222-2222-222222222222', 3, 3,   'tbsp', 'olive oil',             'Pantry',  true,  '3 tbsp olive oil'),
  ('22222222-2222-2222-2222-222222222222', 4, 1,   'tbsp', 'smoked paprika',        'Pantry',  true,  '1 tbsp smoked paprika'),
  ('22222222-2222-2222-2222-222222222222', 5, 1,   'tsp',  'garlic powder',         'Pantry',  true,  '1 tsp garlic powder'),
  ('22222222-2222-2222-2222-222222222222', 6, 1,   '',     'lemon',                 'Produce', false, '1 lemon, cut into wedges'),
  ('22222222-2222-2222-2222-222222222222', 7, null,'',     'salt and pepper',       'Pantry',  true,  'Salt and pepper');

insert into steps (recipe_id, sort_order, body) values
  ('22222222-2222-2222-2222-222222222222', 1, 'Heat oven to 425F. Pat thighs dry. Toss with 2 tbsp oil, smoked paprika, garlic powder, salt, and pepper.'),
  ('22222222-2222-2222-2222-222222222222', 2, 'Arrange thighs skin-side up on a sheet pan. Roast 20 minutes.'),
  ('22222222-2222-2222-2222-222222222222', 3, 'Toss broccoli with remaining 1 tbsp oil and salt. Add to the pan around the chicken and roast 15-18 more minutes, until chicken reaches 175F and broccoli is charred at the edges.'),
  ('22222222-2222-2222-2222-222222222222', 4, 'Squeeze lemon over the top and serve.');

-- 3) Shredded Salsa Chicken (component batch) ---------------------------------
insert into recipes (id, title, meal_types, source_name, active_min, total_min,
  base_servings, scales_cheaply, reheats_well, kids_like, is_component, notes)
values (
  '33333333-3333-3333-3333-333333333333',
  'Shredded Salsa Chicken',
  '{lunch}',
  'House recipe',
  10, 45, 6, true, true, true, true,
  'A component, not a finished meal. Shred and portion; build lunches as component + sauce + carb (rice, tortilla, or greens).'
);

insert into ingredients (recipe_id, sort_order, qty, unit, item, aisle, is_pantry_staple, raw_text) values
  ('33333333-3333-3333-3333-333333333333', 1, 2,   'lb',  'boneless skinless chicken breasts','Meat',   false, '2 lb boneless skinless chicken breasts'),
  ('33333333-3333-3333-3333-333333333333', 2, 1,   'jar', 'salsa (16oz)',           'Pantry',  false, '1 (16 oz) jar salsa'),
  ('33333333-3333-3333-3333-333333333333', 3, 1,   'tsp', 'ground cumin',           'Pantry',  true,  '1 tsp ground cumin'),
  ('33333333-3333-3333-3333-333333333333', 4, 1,   'tsp', 'kosher salt',            'Pantry',  true,  '1 tsp kosher salt');

insert into steps (recipe_id, sort_order, body) values
  ('33333333-3333-3333-3333-333333333333', 1, 'Place chicken in a pot or slow cooker. Pour salsa over and add cumin and salt.'),
  ('33333333-3333-3333-3333-333333333333', 2, 'Simmer covered on the stove 30-35 minutes (or 4 hours on low in a slow cooker), until the chicken shreds easily.'),
  ('33333333-3333-3333-3333-333333333333', 3, 'Shred with two forks and stir back into the liquid. Cool, then portion into lunch containers.');
