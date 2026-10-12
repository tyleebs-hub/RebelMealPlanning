"use client";

import { useState, useTransition } from "react";
import { rateRecipe } from "@/app/ratings/actions";

const NAME: Record<string, string> = { tyler: "Tyler", charity: "Charity", mom: "Mom" };

// One-tap 1-5 star rating for the signed-in person. Tapping your current star
// again clears it. Other household members' ratings show alongside.
export function StarRating({
  recipeId,
  mine,
  others = [],
  prompt = "How was it?",
}: {
  recipeId: string;
  mine: number | null;
  others?: { who: string; stars: number }[];
  prompt?: string;
}) {
  const [stars, setStars] = useState<number | null>(mine);
  const [pending, startT] = useTransition();

  const rate = (n: number) => {
    const next = stars === n ? null : n;
    const before = stars;
    setStars(next);
    startT(async () => {
      const res = await rateRecipe(recipeId, next ?? 0);
      if (!res.ok) setStars(before);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]">
        {stars ? "Your rating" : prompt}
      </span>
      <div className="flex items-center" role="group" aria-label="Rate this recipe">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = stars != null && n <= stars;
          return (
            <button
              key={n}
              type="button"
              onClick={() => rate(n)}
              disabled={pending}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              aria-pressed={stars === n}
              className="flex h-9 w-8 items-center justify-center text-xl leading-none transition-colors disabled:opacity-60"
              style={{ color: on ? "var(--amber)" : "var(--ink2)" }}
            >
              {on ? "★" : "☆"}
            </button>
          );
        })}
      </div>
      {others.length > 0 && (
        <span className="text-xs text-[var(--ink2)]">
          {others.map((o) => `${NAME[o.who] ?? o.who} ${"★".repeat(o.stars)}`).join(" · ")}
        </span>
      )}
    </div>
  );
}
