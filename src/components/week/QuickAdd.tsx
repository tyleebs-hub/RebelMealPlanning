"use client";

import { useEffect, useState, useTransition } from "react";
import { DAYS, dayLabel, formatWeekRange, mondayOfToday, type Day, type Meal } from "@/lib/week";
import { pickCook, weekSlotBrief, type SlotBrief } from "@/app/week/[start]/actions";

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]";

export function QuickAddButton({
  recipeId,
  recipeTitle,
  variant = "tile",
}: {
  recipeId: string;
  recipeTitle: string;
  variant?: "tile" | "full";
}) {
  const [open, setOpen] = useState(false);
  const start = mondayOfToday();

  const openSheet = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      {variant === "full" ? (
        <button
          onClick={openSheet}
          className="rounded-lg border border-[var(--rule)] bg-[var(--card)] px-3 py-2 text-sm font-medium hover:border-[var(--ink2)]"
        >
          Add to this week
        </button>
      ) : (
        <button
          onClick={openSheet}
          aria-label="Add to this week"
          title="Add to this week"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--rule)] bg-[var(--card)]/90 text-lg leading-none text-[var(--ink)] shadow-sm backdrop-blur hover:border-[var(--ink2)] hover:bg-[var(--card)]"
        >
          +
        </button>
      )}
      {open && (
        <QuickAddSheet
          start={start}
          recipeId={recipeId}
          recipeTitle={recipeTitle}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function QuickAddSheet({
  start,
  recipeId,
  recipeTitle,
  onClose,
}: {
  start: string;
  recipeId: string;
  recipeTitle: string;
  onClose: () => void;
}) {
  const [brief, setBrief] = useState<SlotBrief[] | null>(null);
  const [pending, startT] = useTransition();
  const [placing, setPlacing] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    weekSlotBrief(start).then((b) => alive && setBrief(b));
    return () => { alive = false; };
  }, [start]);

  const at = (day: Day, meal: Meal) =>
    brief?.find((b) => b.day === day && b.meal === meal);

  const place = (day: Day, meal: Meal) => {
    setPlacing(`${day}|${meal}`);
    setDone(null);
    startT(async () => {
      await pickCook(start, day, meal, recipeId);
      setBrief((prev) =>
        (prev ?? []).map((b) =>
          b.day === day && b.meal === meal ? { ...b, filled: true, label: recipeTitle } : b,
        ),
      );
      setDone(`${dayLabel(day)} · ${meal}`);
      setPlacing(null);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(18,26,22,0.42)] p-0 backdrop-blur-[1px] sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-[var(--rule)] bg-[var(--card)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 border-b border-[var(--rule)] bg-[var(--card)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-display text-base leading-tight">Add to a slot</span>
            <button onClick={onClose} className="rounded-lg border border-[var(--rule)] px-2 py-1 text-sm hover:bg-[var(--rule2)]">Close</button>
          </div>
          <p className="mt-0.5 truncate text-sm text-[var(--ink2)]">{recipeTitle} · {formatWeekRange(start)}</p>
        </div>

        <div className="p-3">
          {!brief ? (
            <p className="px-1 py-6 text-center text-sm text-[var(--ink2)]">Loading this week…</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {DAYS.map((day) => (
                <li key={day} className="grid grid-cols-[3rem_1fr_1fr] items-stretch gap-1.5">
                  <span className="flex items-center font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink2)]">
                    {day}
                  </span>
                  {(["dinner", "lunch"] as Meal[]).map((meal) => {
                    const s = at(day, meal);
                    const busy = pending && placing === `${day}|${meal}`;
                    if (s?.filled) {
                      return (
                        <div
                          key={meal}
                          className="flex min-h-[44px] flex-col justify-center overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--rule2)] px-2 py-1"
                        >
                          <span className={EYEBROW}>{meal}</span>
                          <span className="truncate text-xs text-[var(--ink2)]">{s.label}</span>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={meal}
                        onClick={() => place(day, meal)}
                        disabled={pending}
                        className="flex min-h-[44px] flex-col justify-center rounded-lg border border-dashed border-[var(--rule)] px-2 py-1 text-left hover:border-[var(--ink2)] hover:bg-[var(--rule2)] disabled:opacity-50"
                      >
                        <span className={EYEBROW}>{meal}</span>
                        <span className="text-xs font-medium text-[var(--ink)]">{busy ? "adding…" : "+ place here"}</span>
                      </button>
                    );
                  })}
                </li>
              ))}
            </ul>
          )}

          {done && (
            <p className="mt-3 text-center text-sm" style={{ color: "var(--go)" }}>
              Added to {done}. <button onClick={onClose} className="underline underline-offset-2">Done</button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
