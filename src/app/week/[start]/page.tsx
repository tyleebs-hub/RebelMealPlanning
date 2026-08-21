import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadWeek, loadSuggestions, type Vote } from "@/lib/week-data";
import {
  DAYS,
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
import { hueMapForEvents } from "@/lib/hues";
import type { MealType } from "@/lib/types";
import { CoverageMeters } from "@/components/week/CoverageMeters";
import { MultiplierStepper } from "@/components/week/MultiplierStepper";
import { WeekGrid, type DayView, type SlotView } from "@/components/week/WeekGrid";
import { addCookEvent, autoFillLunches, deleteCookEvent, addSuggestion, removeSuggestion } from "./actions";
import { VoteButtons } from "@/components/week/VoteButtons";
import { PingCharity } from "@/components/week/PingCharity";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]";

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
  // Unassigned portions: cooked but unclaimed (sum of positive availability).
  const spare = cookEvents.reduce((n, ce) => n + Math.max(0, computeLedger(ce, slots).available), 0);
  const eventById = new Map(cookEvents.map((ce) => [ce.id, ce]));
  const slotByKey = new Map(slots.map((s) => [`${s.day}|${s.meal}`, s]));
  const hueMap = hueMapForEvents(cookEvents);

  const prev = addDaysIso(start, -7);
  const next = addDaysIso(start, 7);

  const slotView = (slot: Slot | undefined): SlotView => {
    if (!slot || !slot.fill_type) return { fill: "empty" };
    if (slot.fill_type === "out") return { fill: "out", outLabel: slot.out_label ?? undefined };
    const ce = slot.cook_event_id ? eventById.get(slot.cook_event_id) : undefined;
    const hue = ce ? hueMap.get(ce.id) : undefined;
    if (slot.fill_type === "cook") {
      return {
        fill: "cook",
        title: ce?.recipe.title,
        hue,
        multiplier: ce?.multiplier,
        produced: ce ? ce.recipe.base_servings * ce.multiplier : 0,
        cookEventId: ce?.id,
      };
    }
    const led = ce ? ledgerById.get(ce.id) : undefined;
    return {
      fill: "leftover",
      title: ce?.recipe.title,
      hue,
      sauce: slot.sauce,
      fromDay: ce?.day ? dayLabel(ce.day) : "prep",
      short: (led?.available ?? 0) < 0,
    };
  };

  const days: DayView[] = DAYS.map((day) => ({
    day,
    label: dayLabel(day),
    dateLabel: dayDateLabel(start, day),
    dinner: slotView(slotByKey.get(`${day}|dinner`)),
    lunch: slotView(slotByKey.get(`${day}|lunch`)),
  }));

  const pickerCooks = cookEvents.map((ce) => ({
    id: ce.id,
    title: ce.recipe.title,
    day: ce.day ?? "",
    available: ledgerById.get(ce.id)?.available ?? 0,
    reheats: ce.recipe.reheats_well,
    hue: hueMap.get(ce.id)!,
  }));
  const pickerRecipes = recipes.map((r) => ({
    id: r.id,
    title: r.title,
    mealTypes: r.meal_types,
    isComponent: r.is_component,
  }));

  const preps = cookEvents.filter((ce) => ce.kind === "prep");

  // Sauce-variation nudge: cook events feeding 4+ lunch slots (CLAUDE.md).
  const lunchByEvent = new Map<string, number>();
  for (const s of slots) {
    if (s.meal === "lunch" && s.fill_type === "leftover" && s.cook_event_id) {
      lunchByEvent.set(s.cook_event_id, (lunchByEvent.get(s.cook_event_id) ?? 0) + 1);
    }
  }
  const sauceNudges = [...lunchByEvent.entries()]
    .filter(([, n]) => n >= 4)
    .map(([id, n]) => ({ title: eventById.get(id)?.recipe.title ?? "a cook", count: n }));

  return (
    <>
      <AppHeader active="week" />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-10">
      <header className="flex items-center justify-between">
        <Link href={`/week/${prev}`} className="rounded-lg px-2 py-1 text-lg text-[var(--ink2)] hover:bg-[var(--rule2)] hover:text-[var(--ink)]" aria-label="Previous week">←</Link>
        <div className="text-center">
          <span className={EYEBROW}>Week of</span>
          <h1 className="mt-0.5 font-mono text-base font-medium sm:text-lg">{formatWeekRange(start)}</h1>
          {start === mondayOfToday() && <p className={`mt-0.5 ${EYEBROW}`}>this week</p>}
        </div>
        <Link href={`/week/${next}`} className="rounded-lg px-2 py-1 text-lg text-[var(--ink2)] hover:bg-[var(--rule2)] hover:text-[var(--ink)]" aria-label="Next week">→</Link>
      </header>

      <div className="mt-4">
        <CoverageMeters coverage={coverage} spare={spare} />
      </div>

      {sauceNudges.length > 0 && (
        <div className="mt-3 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--amber)", background: "var(--amber-soft)", color: "var(--amber-text)" }}>
          {sauceNudges.map((n) => (
            <p key={n.title}>
              {n.count} lunches use <strong>{n.title}</strong> — vary the sauce so it doesn&apos;t feel like the same lunch. Try {SAUCE_ROTATION.join(", ")}.
            </p>
          ))}
        </div>
      )}

      {/* The week — tap a slot to fill it */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className={EYEBROW}>The week</h2>
          <form action={autoFillLunches.bind(null, start)}>
            <button className="rounded-lg border border-[var(--rule)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--rule2)]">
              Auto-fill lunches
            </button>
          </form>
        </div>
        <WeekGrid start={start} days={days} cooks={pickerCooks} recipes={pickerRecipes} sauces={SAUCE_ROTATION} />
      </section>

      {/* Prep & components — batch cooks that feed lunches without owning a dinner slot */}
      <section className="mt-8">
        <h2 className={EYEBROW}>Prep &amp; components</h2>
        {preps.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {preps.map((ce) => {
              const l = ledgerById.get(ce.id)!;
              const hue = hueMap.get(ce.id)!;
              return (
                <li key={ce.id} className="rounded-xl border border-[var(--rule)] bg-[var(--card)] p-3" style={{ borderLeftColor: hue.bg, borderLeftWidth: 4 }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium leading-tight">{ce.recipe.title}</p>
                      <p className={`mt-1 ${EYEBROW}`}>
                        {ce.day ? dayLabel(ce.day) : "any day"}
                        {ce.recipe.is_component ? " · component" : ""}
                        {!ce.recipe.reheats_well ? " · no reheat" : ""}
                      </p>
                    </div>
                    <MultiplierStepper start={start} cookEventId={ce.id} value={ce.multiplier} />
                  </div>
                  <div className="mt-2 flex items-center justify-between font-mono text-xs text-[var(--ink2)]">
                    <span>{l.produced} made · {l.available} free</span>
                    <form action={deleteCookEvent.bind(null, start, ce.id)}>
                      <button className="hover:text-[var(--clay-bg)]">Remove</button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <form action={addCookEvent} className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-[var(--rule)] p-3">
          <input type="hidden" name="start" value={start} />
          <input type="hidden" name="kind" value="prep" />
          <select name="recipeId" required defaultValue="" className="min-w-0 flex-1 rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-2 py-2 text-sm">
            <option value="" disabled>Add a prep / component batch…</option>
            {[...recipes].sort((a, b) => Number(b.is_component) - Number(a.is_component)).map((r) => (
              <option key={r.id} value={r.id}>{r.title}{r.is_component ? " · component" : ""}</option>
            ))}
          </select>
          <input type="number" name="multiplier" min={1} max={8} defaultValue={2} className="w-16 rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-2 py-2 text-sm" />
          <button className="rounded-lg bg-[var(--ink)] px-3 py-2 text-sm font-medium text-[var(--paper)] hover:opacity-90">Add</button>
        </form>
      </section>

      {/* Suggestions + voting */}
      <section className="mt-8">
        <div className="flex items-center justify-between gap-2">
          <h2 className={EYEBROW}>Suggestions</h2>
          <PingCharity />
        </div>

        {suggestions.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {suggestions.map((s) => {
              const tyler = (s.votes.find((v) => v.who === "tyler")?.vote ?? null) as Vote | null;
              const charity = s.votes.find((v) => v.who === "charity")?.vote ?? null;
              return (
                <li key={s.id} className="rounded-xl border border-[var(--rule)] bg-[var(--card)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium leading-tight">{s.recipe.title}</p>
                      {s.note && <p className="mt-0.5 text-xs text-[var(--ink2)]">{s.note}</p>}
                    </div>
                    <form action={removeSuggestion.bind(null, start, s.id)}>
                      <button className="text-xs text-[var(--ink2)] hover:text-[var(--clay-bg)]">Remove</button>
                    </form>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <VoteButtons suggestionId={s.id} current={tyler} />
                    <span className="font-mono text-xs text-[var(--ink2)]">Charity: {charity ?? "—"}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <form action={addSuggestion} className="mt-3 flex flex-col gap-2 rounded-xl border border-dashed border-[var(--rule)] p-3">
          <input type="hidden" name="start" value={start} />
          <select name="recipeId" required defaultValue="" className="rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-2 py-2 text-sm">
            <option value="" disabled>Suggest a recipe…</option>
            {recipes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
          <input name="note" placeholder="Note (optional) — e.g. have frozen chicken to use up" className="rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-2 py-2 text-sm" />
          <button className="self-start rounded-lg bg-[var(--ink)] px-3 py-2 text-sm font-medium text-[var(--paper)] hover:opacity-90">Add suggestion</button>
        </form>
      </section>
      </main>
    </>
  );
}
