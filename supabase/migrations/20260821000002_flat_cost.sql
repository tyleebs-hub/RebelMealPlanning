-- Custom plans: a recipe can carry a flat batch cost (e.g. "Dominos", $25, 6
-- servings) instead of an ingredient-summed cost. When set, it wins over the
-- ingredient math. See CLAUDE.md > Cost.
alter table recipes add column if not exists flat_cost numeric;
