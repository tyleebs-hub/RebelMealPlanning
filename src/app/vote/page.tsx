import Link from "next/link";
import { redirect } from "next/navigation";
import { currentRole } from "@/lib/session";
import { loadSuggestions, loadWeek, type Vote, type Who } from "@/lib/week-data";
import {
  DAYS,
  addDaysIso,
  dayLabel,
  formatWeekRange,
  isMonday,
  mondayOfToday,
} from "@/lib/week";
import { VoteButtons } from "@/components/week/VoteButtons";
import { logout } from "@/app/logout/action";

export const dynamic = "force-dynamic";

const WHO_LABEL: Record<Who, string> = { tyler: "Tyler", charity: "Charity" };

export default async function VotePage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const role = await currentRole();
  if (!role) redirect("/login");
  const me: Who = role === "admin" ? "tyler" : "charity";
  const other: Who = me === "tyler" ? "charity" : "tyler";
  const isAdmin = role === "admin";

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

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:py-10">
      {/* top bar */}
      <div className="flex items-center justify-between">
        <Link
          href={isAdmin ? "/week" : "/login?next=%2Fweek"}
          className="rounded-lg border border-neutral-300 px-2.5 py-1 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          {isAdmin ? "Planner" : "Admin view"}
        </Link>
        <form action={logout}>
          <button className="text-sm text-[var(--ink2)] transition-colors hover:text-[var(--ink)]">
            Sign out
          </button>
        </form>
      </div>

      {/* week nav */}
      <header className="mt-4 flex items-center justify-between">
        <Link href={`/vote?w=${prev}`} className="rounded-lg px-2 py-1 text-lg hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Previous week">
          ←
        </Link>
        <div className="text-center">
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">{formatWeekRange(start)}</h1>
          <p className="text-xs text-neutral-500">{thisWeek ? "this week" : " "}</p>
        </div>
        <Link href={`/vote?w=${next}`} className="rounded-lg px-2 py-1 text-lg hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Next week">
          →
        </Link>
      </header>

      {/* voting */}
      {suggestions.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Vote on dinner ideas</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {suggestions.map((s) => {
              const mine = (s.votes.find((v) => v.who === me)?.vote ?? null) as Vote | null;
              const theirs = s.votes.find((v) => v.who === other)?.vote ?? null;
              return (
                <li key={s.id} className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                  <p className="font-semibold">{s.recipe.title}</p>
                  {s.note && <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{s.note}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <VoteButtons suggestionId={s.id} current={mine} />
                    {theirs && <span className="text-xs text-neutral-400">{WHO_LABEL[other]}: {theirs}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* the plan / record */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {thisWeek ? "The plan" : "What we ate"}
        </h2>
        {!hasPlan ? (
          <p className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
            {suggestions.length === 0
              ? "Nothing planned yet for this week."
              : "No meals planned yet — vote above and Tyler will build the week."}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {DAYS.map((day) => {
              const dinner = slotText(day, "dinner");
              const lunch = slotText(day, "lunch");
              return (
                <li key={day} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950">
                  <span className="font-medium">{dayLabel(day)}</span>
                  <div className="mt-0.5 flex flex-col gap-0.5 text-neutral-600 dark:text-neutral-400">
                    <span><span className="text-xs uppercase text-neutral-400">Dinner</span> {dinner ?? "—"}</span>
                    <span><span className="text-xs uppercase text-neutral-400">Lunch</span> {lunch ?? "—"}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
