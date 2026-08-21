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
import { hueMapForEvents, type Hue } from "@/lib/hues";
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
import { logout } from "@/app/logout/action";

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
  const eventById = new Map(cookEvents.map((ce) => [ce.id, ce]));
  const slotByKey = new Map(slots.map((s) => [`${s.day}|${s.meal}`, s]));
  // Derived (not stored): assign a hue per cook event for color-tracing.
  const hueMap = hueMapForEvents(cookEvents);

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

  const linkCls = "text-sm text-[var(--ink2)] transition-colors hover:text-[var(--ink)]";

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <div className="flex items-center justify-between">
        <form action={logout}>
          <button className={linkCls}>Sign out</button>
        </form>
        <div className="flex gap-4">
          <Link href={`/week/${start}/grocery`} className="text-sm font-medium text-[var(--ink)] transition-colors hover:text-[var(--go)]">
            Groceries
          </Link>
          <Link href="/recipes" className={linkCls}>
            Recipe library
          </Link>
        </div>
      </div>

      <header className="mt-3 flex items-center justify-between">
        <Link href={`/week/${prev}`} className="rounded-lg px-2 py-1 text-lg text-[var(--ink2)] hover:bg-[var(--rule2)] hover:text-[var(--ink)]" aria-label="Previous week">
          ←
        </Link>
        <div className="text-center">
          <h1 className="font-display text-lg tracking-tight sm:text-xl">
            <span className={EYEBROW}>Week of</span>
            <span className="mt-0.5 block font-mono text-base font-medium sm:text-lg">{formatWeekRange(start)}</span>
          </h1>
          {start === mondayOfToday() && <p className={`mt-0.5 ${EYEBROW}`}>this week</p>}
        </div>
        <Link href={`/week/${next}`} className="rounded-lg px-2 py-1 text-lg text-[var(--ink2)] hover:bg-[var(--rule2)] hover:text-[var(--ink)]" aria-label="Next week">
          →
        </Link>
      </header>

      <div className="mt-4">
        <CoverageMeters coverage={coverage} />
      </div>

      {sauceNudges.length > 0 && (
        <div className="mt-3 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--amber)", background: "var(--amber-soft)", color: "var(--amber-text)" }}>
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
        <h2 className={EYEBROW}>Cooks this week</h2>
        {cookEvents.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ink2)]">No cooks yet. Add one below.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {cookEvents.map((ce) => {
              const l = ledgerById.get(ce.id)!;
              const hue = hueMap.get(ce.id)!;
              return (
                <li
                  key={ce.id}
                  className="rounded-xl border border-[var(--rule)] bg-[var(--card)] p-3"
                  style={{ borderLeftColor: hue.bg, borderLeftWidth: 4 }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium leading-tight">{ce.recipe.title}</p>
                      <p className={`mt-1 ${EYEBROW}`}>
                        {ce.kind === "dinner" ? "Dinner" : "Prep"}
                        {ce.day ? ` · ${dayLabel(ce.day)}` : ""}
                        {ce.recipe.is_component ? " · component" : ""}
                        {!ce.recipe.reheats_well ? " · no reheat" : ""}
                      </p>
                    </div>
                    <MultiplierStepper start={start} cookEventId={ce.id} value={ce.multiplier} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-xs">
                    <Chip label={`makes ${l.produced}`} />
                    {l.reserved > 0 && <Chip label={`−${l.reserved} dinner`} />}
                    {l.claimed > 0 && <Chip label={`−${l.claimed} lunch`} />}
                    <Chip
                      label={`${l.available} left`}
                      tone={l.available < 0 ? "bad" : l.available === 0 ? "muted" : "good"}
                    />
                    <form action={deleteCookEvent.bind(null, start, ce.id)} className="ml-auto">
                      <button className="text-[var(--ink2)] hover:text-[var(--clay-bg)]" aria-label="Delete cook">
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
          <h2 className={EYEBROW}>The week</h2>
          <form action={autoFillLunches.bind(null, start)}>
            <button className="rounded-lg border border-[var(--rule)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--rule2)]">
              Auto-fill lunches
            </button>
          </form>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {DAYS.map((day) => (
            <div key={day} className="rounded-xl border border-[var(--rule)] bg-[var(--card)] p-3">
              <div className="flex items-baseline justify-between">
                <span className="font-display text-sm">{dayLabel(day)}</span>
                <span className={`font-mono ${EYEBROW}`}>{dayDateLabel(start, day)}</span>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <SlotCell start={start} day={day} meal="dinner" slot={slotByKey.get(`${day}|dinner`)} cookEvents={cookEvents} ledgerById={ledgerById} hueMap={hueMap} />
                <SlotCell start={start} day={day} meal="lunch" slot={slotByKey.get(`${day}|lunch`)} cookEvents={cookEvents} ledgerById={ledgerById} hueMap={hueMap} />
              </div>
            </div>
          ))}
        </div>
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

        <form
          action={addSuggestion}
          className="mt-3 flex flex-col gap-2 rounded-xl border border-dashed border-[var(--rule)] p-3"
        >
          <input type="hidden" name="start" value={start} />
          <select
            name="recipeId"
            required
            defaultValue=""
            className="rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-2 py-2 text-sm"
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
            className="rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-2 py-2 text-sm"
          />
          <button className="self-start rounded-lg bg-[var(--ink)] px-3 py-2 text-sm font-medium text-[var(--paper)] hover:opacity-90">
            Add suggestion
          </button>
        </form>
      </section>
    </main>
  );
}

function Chip({ label, tone }: { label: string; tone?: "good" | "bad" | "muted" }) {
  const style =
    tone === "bad"
      ? { borderColor: "var(--clay-bg)", background: "var(--clay-soft)", color: "var(--clay-text)" }
      : tone === "good"
        ? { borderColor: "var(--go)", background: "var(--teal-soft)", color: "var(--teal-text)" }
        : { borderColor: "var(--rule)", background: "var(--paper)", color: "var(--ink2)" };
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5" style={style}>
      {label}
    </span>
  );
}

function SlotCell({
  start,
  day,
  meal,
  slot,
  cookEvents,
  ledgerById,
  hueMap,
}: {
  start: string;
  day: Day;
  meal: Meal;
  slot: Slot | undefined;
  cookEvents: CookEvent[];
  ledgerById: Map<string, ReturnType<typeof computeLedger>>;
  hueMap: Map<string, Hue>;
}) {
  const eventById = new Map(cookEvents.map((ce) => [ce.id, ce]));
  const linked = slot?.cook_event_id ? eventById.get(slot.cook_event_id) : undefined;
  const hue = linked ? hueMap.get(linked.id) : undefined;
  const label = meal === "dinner" ? "Dinner" : "Lunch";

  // ---- summary (the visible slot surface); the four states -----------------
  let summaryInner: ReactNode;
  let summaryStyle: React.CSSProperties = {};
  let summaryClass =
    "flex min-h-[68px] cursor-pointer list-none flex-col justify-center gap-0.5 rounded-lg px-3 py-2";

  if (!slot || !slot.fill_type) {
    summaryClass += " items-center border border-dashed border-[var(--rule)] text-[var(--ink2)] hover:border-[var(--ink2)]";
    summaryInner = <span className="text-sm font-medium">+ {label}</span>;
  } else if (slot.fill_type === "out") {
    summaryClass += " border border-dashed border-[var(--rule)]";
    summaryInner = (
      <>
        <span className={EYEBROW}>{label}</span>
        <span className="text-sm text-[var(--ink2)]">{slot.out_label || "Out"}</span>
      </>
    );
  } else if (slot.fill_type === "cook") {
    summaryClass += " border border-[var(--rule)] bg-[var(--card)]";
    summaryStyle = { borderLeftColor: hue?.bg, borderLeftWidth: 4 };
    const produced = linked ? linked.recipe.base_servings * linked.multiplier : 0;
    summaryInner = (
      <>
        <span className={EYEBROW}>{label} · cook</span>
        <span className="text-sm font-semibold leading-tight">{linked?.recipe.title ?? "Cook"}</span>
        <span className="font-mono text-[11px]" style={{ color: hue?.text }}>
          ×{linked?.multiplier} · {produced} servings
        </span>
      </>
    );
  } else {
    // leftover
    const srcLedger = linked ? ledgerById.get(linked.id) : undefined;
    const short = (srcLedger?.available ?? 0) < 0;
    summaryStyle = { borderLeftColor: hue?.bg, borderLeftWidth: 4, background: hue?.soft };
    summaryClass += " border border-[var(--rule)]";
    summaryInner = (
      <>
        <span className={EYEBROW}>{label} · leftover</span>
        <span className="text-sm font-semibold leading-tight">{linked?.recipe.title ?? "Leftover"}</span>
        <span className="font-mono text-[11px]" style={{ color: short ? "var(--clay-bg)" : hue?.text }}>
          {short
            ? "not enough cooked"
            : `from ${linked?.day ? dayLabel(linked.day) : "prep"} · 2 portions${slot.sauce ? ` · ${slot.sauce}` : ""}`}
        </span>
      </>
    );
  }

  return (
    <details className="group">
      <summary className={summaryClass} style={summaryStyle}>
        {summaryInner}
      </summary>

      <div className="mt-1.5 flex flex-col gap-2 rounded-lg border border-[var(--rule2)] bg-[var(--card)] px-3 py-2">
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
              className="min-w-0 flex-1 rounded-md border border-[var(--rule)] bg-[var(--paper)] px-2 py-1.5 text-sm"
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
                className="rounded-md border border-[var(--rule)] bg-[var(--paper)] px-2 py-1.5 text-sm"
              >
                <option value="">no sauce</option>
                {SAUCE_ROTATION.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
            <button className="rounded-md bg-[var(--ink)] px-2.5 py-1.5 text-sm text-[var(--paper)] hover:opacity-90">
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
            className="min-w-0 flex-1 rounded-md border border-[var(--rule)] bg-[var(--paper)] px-2 py-1.5 text-sm"
          />
          <button className="rounded-md border border-[var(--rule)] px-2.5 py-1.5 text-sm hover:bg-[var(--rule2)]">
            Out
          </button>
        </form>

        {slot?.fill_type && (
          <form action={clearSlot.bind(null, start, day, meal)}>
            <button className="text-sm text-[var(--ink2)] hover:text-[var(--clay-bg)]">Clear</button>
          </form>
        )}
      </div>
    </details>
  );
}
