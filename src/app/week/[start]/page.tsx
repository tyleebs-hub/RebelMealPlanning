import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadWeek, loadSuggestions, type Vote } from "@/lib/week-data";
import {
  DAYS,
  type Day,
  type Meal,
  type CookEvent,
  type Slot,
  addDaysIso,
  computeCoverage,
  computeLedger,
  dayLabel,
  dayDateLabel,
  formatWeekRange,
  isMonday,
  mondayOfToday,
  SAUCE_ROTATION,
} from "@/lib/week";
import type { MealType } from "@/lib/types";
import { CoverageMeters } from "@/components/week/CoverageMeters";
import { MultiplierStepper } from "@/components/week/MultiplierStepper";
import { AddCookForm } from "@/components/week/AddCookForm";
import {
  addSuggestion,
  assignLeftover,
  autoFillLunches,
  clearSlot,
  deleteCookEvent,
  removeSuggestion,
  setOut,
} from "./actions";
import { VoteButtons } from "@/components/week/VoteButtons";
import { PingCharity } from "@/components/week/PingCharity";

export const dynamic = "force-dynamic";

type PickRecipe = { id: string; title: string; meal_types: MealType[]; is_component: boolean };

export default async function WeekPage({ params }: { params: Promise<{ start: string }> }) {
  const { start } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !isMonday(start)) {
    redirect(`/week/${mondayOfToday()}`);
  }

  const { cookEvents, slots } = await loadWeek(start);
  const { suggestions } = await loadSuggestions(start);

  const sb = getSupabaseAdmin();
  const { data: recipeData } = await sb
    .from("recipes")
    .select("id,title,meal_types,is_component")
    .order("title");
  const recipes = (recipeData ?? []) as PickRecipe[];

  const coverage = computeCoverage(slots);
  const ledgerById = new Map(cookEvents.map((ce) => [ce.id, computeLedger(ce, slots)]));
  const eventById = new Map(cookEvents.map((ce) => [ce.id, ce]));
  const slotByKey = new Map(slots.map((s) => [`${s.day}|${s.meal}`, s]));

  const prev = addDaysIso(start, -7);
  const next = addDaysIso(start, 7);

  // Sauce-variation nudge: cook events feeding 4+ lunch slots (CLAUDE.md).
  const lunchByEvent = new Map<string, Slot[]>();
  for (const s of slots) {
    if (s.meal === "lunch" && s.fill_type === "leftover" && s.cook_event_id) {
      const arr = lunchByEvent.get(s.cook_event_id) ?? [];
      arr.push(s);
      lunchByEvent.set(s.cook_event_id, arr);
    }
  }
  const sauceNudges = [...lunchByEvent.entries()]
    .filter(([, arr]) => arr.length >= 4)
    .map(([id, arr]) => ({ title: eventById.get(id)?.recipe.title ?? "a cook", count: arr.length }));

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200">
          ← Home
        </Link>
        <div className="flex gap-4">
          <Link href={`/week/${start}/grocery`} className="text-sm font-medium text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100">
            Groceries
          </Link>
          <Link href="/recipes" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200">
            Recipe library
          </Link>
        </div>
      </div>

      <header className="mt-3 flex items-center justify-between">
        <Link href={`/week/${prev}`} className="rounded-lg px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Previous week">
          ←
        </Link>
        <div className="text-center">
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">Week of {formatWeekRange(start)}</h1>
          {start === mondayOfToday() && <p className="text-xs text-neutral-500">this week</p>}
        </div>
        <Link href={`/week/${next}`} className="rounded-lg px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Next week">
          →
        </Link>
      </header>

      <div className="mt-4">
        <CoverageMeters coverage={coverage} />
      </div>

      {sauceNudges.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-400/60 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {sauceNudges.map((n) => (
            <p key={n.title}>
              {n.count} lunches use <strong>{n.title}</strong> — vary the sauce so it doesn&apos;t feel like the
              same lunch. Try {SAUCE_ROTATION.join(", ")}.
            </p>
          ))}
        </div>
      )}

      {/* Supply: cooks this week */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Cooks this week</h2>
        {cookEvents.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No cooks yet. Add one below.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {cookEvents.map((ce) => {
              const l = ledgerById.get(ce.id)!;
              return (
                <li
                  key={ce.id}
                  className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium leading-tight">{ce.recipe.title}</p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {ce.kind === "dinner" ? "Dinner" : "Prep"}
                        {ce.day ? ` · ${dayLabel(ce.day)}` : ""}
                        {ce.recipe.is_component ? " · component" : ""}
                        {!ce.recipe.reheats_well ? " · does not reheat" : ""}
                      </p>
                    </div>
                    <MultiplierStepper start={start} cookEventId={ce.id} value={ce.multiplier} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    <Chip label={`makes ${l.produced}`} />
                    {l.reserved > 0 && <Chip label={`−${l.reserved} dinner`} />}
                    {l.claimed > 0 && <Chip label={`−${l.claimed} lunches`} />}
                    <Chip
                      label={`${l.available} left`}
                      tone={l.available < 0 ? "bad" : l.available === 0 ? "muted" : "good"}
                    />
                    <form action={deleteCookEvent.bind(null, start, ce.id)} className="ml-auto">
                      <button className="text-neutral-400 hover:text-red-600" aria-label="Delete cook">
                        Remove
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <AddCookForm start={start} recipes={recipes} />
      </section>

      {/* Demand: the week */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">The week</h2>
          <form action={autoFillLunches.bind(null, start)}>
            <button className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
              Auto-fill lunches
            </button>
          </form>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {DAYS.map((day) => (
            <div
              key={day}
              className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{dayLabel(day)}</span>
                <span className="text-xs text-neutral-400">{dayDateLabel(start, day)}</span>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <SlotCell start={start} day={day} meal="dinner" slot={slotByKey.get(`${day}|dinner`)} cookEvents={cookEvents} ledgerById={ledgerById} />
                <SlotCell start={start} day={day} meal="lunch" slot={slotByKey.get(`${day}|lunch`)} cookEvents={cookEvents} ledgerById={ledgerById} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Suggestions + voting */}
      <section className="mt-8">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Suggestions</h2>
          <PingCharity />
        </div>

        {suggestions.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {suggestions.map((s) => {
              const tyler = (s.votes.find((v) => v.who === "tyler")?.vote ?? null) as Vote | null;
              const charity = s.votes.find((v) => v.who === "charity")?.vote ?? null;
              return (
                <li
                  key={s.id}
                  className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium leading-tight">{s.recipe.title}</p>
                      {s.note && <p className="mt-0.5 text-xs text-neutral-500">{s.note}</p>}
                    </div>
                    <form action={removeSuggestion.bind(null, start, s.id)}>
                      <button className="text-xs text-neutral-400 hover:text-red-600">Remove</button>
                    </form>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <VoteButtons suggestionId={s.id} current={tyler} />
                    <span className="text-xs text-neutral-400">
                      Charity: {charity ?? "—"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <form
          action={addSuggestion}
          className="mt-3 flex flex-col gap-2 rounded-xl border border-dashed border-neutral-300 p-3 dark:border-neutral-700"
        >
          <input type="hidden" name="start" value={start} />
          <select
            name="recipeId"
            required
            defaultValue=""
            className="rounded-lg border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value="" disabled>
              Suggest a recipe…
            </option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
          <input
            name="note"
            placeholder="Note (optional) — e.g. have frozen chicken to use up"
            className="rounded-lg border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
          <button className="self-start rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
            Add suggestion
          </button>
        </form>
      </section>
    </main>
  );
}

function Chip({ label, tone }: { label: string; tone?: "good" | "bad" | "muted" }) {
  const cls =
    tone === "bad"
      ? "border-red-400/60 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
      : tone === "good"
        ? "border-emerald-400/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        : "border-neutral-300 bg-neutral-50 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 ${cls}`}>{label}</span>;
}

function SlotCell({
  start,
  day,
  meal,
  slot,
  cookEvents,
  ledgerById,
}: {
  start: string;
  day: Day;
  meal: Meal;
  slot: Slot | undefined;
  cookEvents: CookEvent[];
  ledgerById: Map<string, ReturnType<typeof computeLedger>>;
}) {
  const eventById = new Map(cookEvents.map((ce) => [ce.id, ce]));
  const linked = slot?.cook_event_id ? eventById.get(slot.cook_event_id) : undefined;

  let summary: ReactNode;
  if (!slot || !slot.fill_type) {
    summary = <span className="text-neutral-400">empty</span>;
  } else if (slot.fill_type === "out") {
    summary = <span>{slot.out_label || "Out"}</span>;
  } else if (slot.fill_type === "cook") {
    summary = <span>{linked?.recipe.title ?? "Cook"}</span>;
  } else {
    summary = (
      <span>
        {linked?.recipe.title ?? "Leftover"}
        {slot.sauce ? <span className="text-neutral-500"> · {slot.sauce}</span> : ""}
      </span>
    );
  }

  const label = meal === "dinner" ? "Dinner" : "Lunch";

  return (
    <details className="group rounded-lg border border-neutral-200 dark:border-neutral-800">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</span>
          <span className="truncate">{summary}</span>
        </span>
        <span className="text-neutral-400 transition-transform group-open:rotate-90">›</span>
      </summary>

      <div className="flex flex-col gap-2 border-t border-neutral-200 px-3 py-2 dark:border-neutral-800">
        {/* Assign leftover from a cook */}
        {cookEvents.length > 0 && (
          <form action={assignLeftover} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="start" value={start} />
            <input type="hidden" name="day" value={day} />
            <input type="hidden" name="meal" value={meal} />
            <select
              name="cookEventId"
              required
              defaultValue=""
              className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            >
              <option value="" disabled>
                Leftover from…
              </option>
              {cookEvents.map((ce) => {
                const avail = ledgerById.get(ce.id)?.available ?? 0;
                return (
                  <option key={ce.id} value={ce.id}>
                    {ce.recipe.title} ({avail} left{ce.recipe.reheats_well ? "" : ", no reheat"})
                  </option>
                );
              })}
            </select>
            {meal === "lunch" && (
              <select
                name="sauce"
                defaultValue=""
                className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
              >
                <option value="">no sauce</option>
                {SAUCE_ROTATION.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
            <button className="rounded-md bg-neutral-900 px-2.5 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
              Set
            </button>
          </form>
        )}

        {/* Mark out */}
        <form action={setOut} className="flex items-center gap-2">
          <input type="hidden" name="start" value={start} />
          <input type="hidden" name="day" value={day} />
          <input type="hidden" name="meal" value={meal} />
          <input
            name="label"
            placeholder={meal === "dinner" ? "Costco pizza / eating out" : "Out"}
            className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
          <button className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
            Out
          </button>
        </form>

        {slot?.fill_type && (
          <form action={clearSlot.bind(null, start, day, meal)}>
            <button className="text-sm text-neutral-400 hover:text-red-600">Clear</button>
          </form>
        )}
      </div>
    </details>
  );
}
