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
import { recipeCost, weeklyCost, type RecipeCost } from "@/lib/cost";
import { loadPrices } from "@/lib/cost-data";
import { CoverageMeters } from "@/components/week/CoverageMeters";
import { CostPanel } from "@/components/week/CostPanel";
import { GeneratePlan } from "@/components/week/GeneratePlan";
import { isAiConfigured } from "@/lib/ai/client";
import { WeekGrid, type DayView, type SlotView } from "@/components/week/WeekGrid";
import { autoFillLunches, removeSuggestion } from "./actions";
import { PingCharity } from "@/components/week/PingCharity";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]";

type PickRecipe = {
  id: string;
  title: string;
  meal_types: MealType[];
  is_component: boolean;
  active_min: number | null;
  kids_like: boolean;
  reheats_well: boolean;
};

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
    .select("id,title,meal_types,is_component,active_min,kids_like,reheats_well")
    .order("title");
  const recipes = (recipeData ?? []) as PickRecipe[];

  const coverage = computeCoverage(slots);

  // Weekly cost: sum each planned recipe's ingredient cost, allocate across slots.
  const plannedIds = [...new Set(cookEvents.map((ce) => ce.recipe_id))];
  const recipeCostById = new Map<string, RecipeCost>();
  if (plannedIds.length > 0) {
    const [{ data: ingRows }, prices] = await Promise.all([
      sb.from("ingredients").select("recipe_id,qty,unit,item").in("recipe_id", plannedIds),
      loadPrices(),
    ]);
    const byRecipe = new Map<string, { qty: number | null; unit: string | null; item: string }[]>();
    for (const r of (ingRows ?? []) as { recipe_id: string; qty: number | null; unit: string | null; item: string }[]) {
      (byRecipe.get(r.recipe_id) ?? byRecipe.set(r.recipe_id, []).get(r.recipe_id)!).push(r);
    }
    for (const id of plannedIds) recipeCostById.set(id, recipeCost(byRecipe.get(id) ?? [], prices));
  }
  const cost = weeklyCost(cookEvents, slots, recipeCostById);

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
    meal_types: r.meal_types,
    isComponent: r.is_component,
    active_min: r.active_min,
    kids_like: r.kids_like,
    reheats_well: r.reheats_well,
  }));

  // The recipes Tyler has drafted this week — what Charity votes on.
  const plannedRecipes = [
    ...new Map(cookEvents.map((ce) => [ce.recipe_id, ce.recipe.title])).entries(),
  ].map(([id, title]) => ({ id, title }));
  const charityVoteByRecipe = new Map<string, Vote | null>();
  for (const s of suggestions) {
    charityVoteByRecipe.set(s.recipe_id, (s.votes.find((v) => v.who === "charity")?.vote ?? null) as Vote | null);
  }

  // Recipes suggested this week that aren't drafted into the plan yet — the
  // "Charity wants to try this" flag. Once you cook it, it leaves this list.
  const plannedRecipeIds = new Set(cookEvents.map((ce) => ce.recipe_id));
  const charityPicks = suggestions
    .filter((s) => !plannedRecipeIds.has(s.recipe_id))
    .map((s) => ({ id: s.recipe_id, suggestionId: s.id, title: s.recipe.title, note: s.note }));

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

      <div className="mt-3">
        <CostPanel start={start} cost={cost} />
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

      {charityPicks.length > 0 && (
        <section className="mt-4 rounded-xl border px-4 py-3" style={{ borderColor: "var(--go)", background: "var(--go-soft, var(--rule2))" }}>
          <h2 className={EYEBROW}>Charity wants to try</h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {charityPicks.map((p) => (
              <li key={p.suggestionId} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">{p.title}</span>
                  {p.note && <span className="ml-2 text-[var(--ink2)]">{p.note}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <Link href={`/recipes/${p.id}`} className="font-mono text-xs text-[var(--ink2)] underline underline-offset-2 hover:text-[var(--ink)]">
                    view
                  </Link>
                  <form action={removeSuggestion.bind(null, start, p.suggestionId)}>
                    <button aria-label={`Remove ${p.title}`} className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--ink2)] hover:bg-[var(--rule2)] hover:text-[var(--clay-bg)]">
                      ✕
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 font-mono text-[10px] text-[var(--ink2)]">Tap a day&apos;s + Dinner to work one in — it clears from here once you do.</p>
        </section>
      )}

      {/* The week — tap a slot to fill it */}
      <section className="mt-8">
        <div className="flex items-center justify-between gap-2">
          <h2 className={EYEBROW}>The week</h2>
          <div className="flex items-center gap-2">
            {isAiConfigured && <GeneratePlan start={start} />}
            <form action={autoFillLunches.bind(null, start)}>
              <button className="rounded-lg border border-[var(--rule)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--rule2)]">
                Auto-fill lunches
              </button>
            </form>
          </div>
        </div>
        <WeekGrid start={start} days={days} cooks={pickerCooks} recipes={pickerRecipes} sauces={SAUCE_ROTATION} aiEnabled={isAiConfigured} />
      </section>

      {/* Charity's votes — she votes on whatever you've drafted above */}
      <section className="mt-8">
        <div className="flex items-center justify-between gap-2">
          <h2 className={EYEBROW}>Charity&apos;s votes</h2>
          <PingCharity />
        </div>

        {plannedRecipes.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--ink2)]">
            Draft the week above, then tap Ping Charity to send her the list to vote on.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {plannedRecipes.map((r) => {
              const v = charityVoteByRecipe.get(r.id) ?? null;
              const tone =
                v === "yes" ? "var(--go)" : v === "pass" ? "var(--clay-bg)" : v === "sure" ? "var(--amber)" : "var(--ink2)";
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--rule)] bg-[var(--card)] px-3 py-2 text-sm">
                  <span>{r.title}</span>
                  <span className="font-mono text-xs" style={{ color: tone }}>
                    {v === "yes" ? "excited" : v === "pass" ? "wants gone" : v === "sure" ? "sure" : "no vote yet"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </main>
    </>
  );
}
