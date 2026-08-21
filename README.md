# Meal Planner

Private household meal planner for Tyler and Charity Leber. See
[CLAUDE.md](./CLAUDE.md) for the full spec and the one idea that matters
(cook events produce servings; slots consume them).

Stack: Next.js (App Router) · Supabase Postgres + Storage · Tailwind ·
deployed on Vercel via the GitHub integration (every push to `main` ships).

## Local setup

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase URL + anon key
npm run dev                         # http://localhost:3000
```

Without Supabase env vars the app still runs and shows a setup notice.

## Database

Schema and seed live in `supabase/`:

- `supabase/migrations/20260820000001_init.sql` — full schema
- `supabase/seed.sql` — 3 hand-written starter recipes

Apply them to your Supabase project (SQL editor, `psql`, or the Supabase CLI /
MCP tools). The seed is idempotent.

## Build order

Phased build; each phase ships before the next starts. See the Build order
section of [CLAUDE.md](./CLAUDE.md). Current: **phase 1** — schema, seed, recipe
list and detail pages, no auth.
