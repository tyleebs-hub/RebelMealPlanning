import { redirect } from "next/navigation";
import { currentRole } from "@/lib/session";
import { loadSuggestions, type Vote, type Who } from "@/lib/week-data";
import { mondayOfToday, formatWeekRange } from "@/lib/week";
import { VoteButtons } from "@/components/week/VoteButtons";

export const dynamic = "force-dynamic";

const WHO_LABEL: Record<Who, string> = { tyler: "Tyler", charity: "Charity" };

export default async function VotePage() {
  const role = await currentRole();
  if (!role) redirect("/login");
  const me: Who = role === "admin" ? "tyler" : "charity";
  const other: Who = me === "tyler" ? "charity" : "tyler";

  const start = mondayOfToday();
  const { suggestions } = await loadSuggestions(start);

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:py-12">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">This week&apos;s dinner ideas</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Week of {formatWeekRange(start)} · voting as {WHO_LABEL[me]}
        </p>
      </header>

      {suggestions.length === 0 ? (
        <p className="mt-8 rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
          No ideas posted yet. Check back soon!
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {suggestions.map((s) => {
            const mine = (s.votes.find((v) => v.who === me)?.vote ?? null) as Vote | null;
            const theirs = s.votes.find((v) => v.who === other)?.vote ?? null;
            return (
              <li
                key={s.id}
                className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
              >
                <p className="font-semibold">{s.recipe.title}</p>
                {s.note && (
                  <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{s.note}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <VoteButtons suggestionId={s.id} current={mine} />
                  {theirs && (
                    <span className="text-xs text-neutral-400">
                      {WHO_LABEL[other]}: {theirs}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
