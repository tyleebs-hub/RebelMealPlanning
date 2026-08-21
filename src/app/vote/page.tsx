import Link from "next/link";
import { redirect } from "next/navigation";
import { currentWho } from "@/lib/session";
import { loadSuggestions, loadWeek, type Vote, type Who } from "@/lib/week-data";
import { DAYS, addDaysIso, formatWeekRange, isMonday, mondayOfToday } from "@/lib/week";
import { VoteButtons } from "@/components/week/VoteButtons";
import { SuggestRecipe } from "@/components/week/SuggestRecipe";
import { DishArt } from "@/components/DishArt";
import { hueForRecipe } from "@/lib/hues";
import { publicImageUrl } from "@/lib/storage";
import { AppHeader } from "@/components/AppHeader";

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]";

export const dynamic = "force-dynamic";

const WHO_LABEL: Record<Who, string> = { tyler: "Tyler", charity: "Charity" };

export default async function VotePage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const who = await currentWho();
  if (!who) redirect("/login");
  const me: Who = who;
  const other: Who = me === "tyler" ? "charity" : "tyler";

  const { w } = await searchParams;
  const start = w && /^\d{4}-\d{2}-\d{2}$/.test(w) && isMonday(w) ? w : mondayOfToday();
  const thisWeek = start === mondayOfToday();

  const [{ suggestions }, { cookEvents, slots }] = await Promise.all([
    loadSuggestions(start),
    loadWeek(start),
  ]);

  const eventById = new Map(cookEvents.map((c) => [c.id, c]));
  const slotByKey = new Map(slots.map((s) => [`${s.day}|${s.meal}`, s]));
  const prev = addDaysIso(start, -7);
  const next = addDaysIso(start, 7);

  const slotText = (day: string, meal: "dinner" | "lunch") => {
    const s = slotByKey.get(`${day}|${meal}`);
    if (!s || !s.fill_type) return null;
    if (s.fill_type === "out") return s.out_label || "Out";
    const title = s.cook_event_id ? eventById.get(s.cook_event_id)?.recipe.title : null;
    if (s.fill_type === "leftover" && meal === "lunch" && s.sauce) return `${title ?? "Leftover"} · ${s.sauce}`;
    return title ?? (s.fill_type === "leftover" ? "Leftover" : "Cooking");
  };

  const hasPlan = slots.some((s) => s.fill_type);

  // The recipes Tyler drafted this week — distinct across all cooks — are what
  // Charity votes on. No manual "suggestions" step.
  const plannedRecipes = [
    ...new Map(cookEvents.map((c) => [c.recipe_id, c.recipe])).entries(),
  ].map(([id, recipe]) => ({ id, title: recipe.title, image_path: recipe.image_path }));

  const voteByRecipe = new Map<string, { mine: Vote | null; theirs: Vote | null }>();
  for (const s of suggestions) {
    voteByRecipe.set(s.recipe_id, {
      mine: (s.votes.find((v) => v.who === me)?.vote ?? null) as Vote | null,
      theirs: (s.votes.find((v) => v.who === other)?.vote ?? null) as Vote | null,
    });
  }

  const votedCount = plannedRecipes.filter((r) => voteByRecipe.get(r.id)?.mine).length;
  const pct = plannedRecipes.length ? Math.round((votedCount / plannedRecipes.length) * 100) : 0;

  // Ideas suggested this week that Tyler hasn't drafted into the plan yet.
  const plannedIds = new Set(cookEvents.map((c) => c.recipe_id));
  const sentIdeas = suggestions
    .filter((s) => !plannedIds.has(s.recipe_id))
    .map((s) => ({ id: s.recipe_id, title: s.recipe.title, note: s.note }));

  return (
    <>
      <AppHeader active="vote" />
      <main className="mx-auto max-w-xl px-4 py-6 sm:py-10">
        <div className="text-center">
          <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
            {thisWeek ? "What sounds good?" : "What we ate"}
          </h1>
          <p className="mt-1.5 text-sm text-[var(--ink2)]">
            {thisWeek
              ? "Tap through this week's ideas — nothing's locked in, and Tyler plans around what you pick."
              : "A look back at this week's meals."}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-center gap-3">
          <Link href={`/vote?w=${prev}`} className="rounded-lg px-2 py-1 text-lg text-[var(--ink2)] hover:bg-[var(--rule2)] hover:text-[var(--ink)]" aria-label="Previous week">←</Link>
          <span className="font-mono text-sm text-[var(--ink2)]">{formatWeekRange(start)}</span>
          <Link href={`/vote?w=${next}`} className="rounded-lg px-2 py-1 text-lg text-[var(--ink2)] hover:bg-[var(--rule2)] hover:text-[var(--ink)]" aria-label="Next week">→</Link>
        </div>

        {plannedRecipes.length > 0 && (
          <section className="mt-6">
            <div className="flex items-center justify-between">
              <h2 className={EYEBROW}>Vote · {WHO_LABEL[me]}</h2>
              <span className="font-mono text-xs text-[var(--ink2)]">{votedCount}/{plannedRecipes.length}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--rule2)]">
              <div className="h-full rounded-full bg-[var(--go)] transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${pct}%` }} />
            </div>

            <ul className="mt-4 flex flex-col gap-4">
              {plannedRecipes.map((r) => {
                const votes = voteByRecipe.get(r.id);
                return (
                  <li key={r.id} className="overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--card)]">
                    <DishArt imageUrl={publicImageUrl(r.image_path)} title={r.title} hue={hueForRecipe(r.id)} tall />
                    <div className="p-4">
                      <h3 className="font-display text-xl leading-tight">{r.title}</h3>
                      {votes?.theirs && (
                        <p className="mt-1 font-mono text-[11px] text-[var(--ink2)]">{WHO_LABEL[other]} said {votes.theirs}</p>
                      )}
                      <div className="mt-3">
                        <VoteButtons start={start} recipeId={r.id} current={votes?.mine ?? null} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {thisWeek && (
          <>
            <SuggestRecipe start={start} />
            {sentIdeas.length > 0 && (
              <div className="mt-3">
                <h2 className={EYEBROW}>Ideas you&apos;ve sent</h2>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {sentIdeas.map((s) => (
                    <li key={s.id} className="rounded-lg border border-[var(--rule)] bg-[var(--card)] px-3 py-2 text-sm">
                      <span className="font-medium">{s.title}</span>
                      {s.note && <span className="ml-2 text-[var(--ink2)]">{s.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <section className="mt-8">
          <h2 className={EYEBROW}>{thisWeek ? "The plan" : "The week"}</h2>
          {!hasPlan ? (
            <p className="mt-3 rounded-xl border border-[var(--rule)] bg-[var(--card)] p-4 text-sm text-[var(--ink2)]">
              Nothing planned yet for this week — check back once Tyler drafts it.
            </p>
          ) : (
            <ul className="mt-3 overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--card)]">
              {DAYS.map((day, i) => {
                const dinner = slotText(day, "dinner");
                const lunch = slotText(day, "lunch");
                return (
                  <li key={day} className={`flex items-baseline gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-[var(--rule2)]" : ""}`}>
                    <span className="w-10 shrink-0 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink2)]">{day}</span>
                    <span className="text-sm">{dinner ?? <span className="text-[var(--ink2)]">—</span>}</span>
                    {lunch && <span className="ml-auto font-mono text-[11px] text-[var(--ink2)]">lunch: {lunch}</span>}
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
