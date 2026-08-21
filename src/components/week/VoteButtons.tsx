"use client";

import { useState, useTransition } from "react";
import { castVote } from "@/app/week/[start]/actions";

type Vote = "yes" | "sure" | "pass";

const OPTIONS: { value: Vote; label: string; color: string }[] = [
  { value: "yes", label: "Yes!", color: "var(--go)" },
  { value: "sure", label: "Sure", color: "var(--amber)" },
  { value: "pass", label: "Pass", color: "var(--clay-bg)" },
];

export function VoteButtons({
  start,
  recipeId,
  current,
}: {
  start: string;
  recipeId: string;
  current: Vote | null;
}) {
  const [vote, setVote] = useState<Vote | null>(current);
  const [pending, startTransition] = useTransition();

  const choose = (v: Vote) => {
    setVote(v);
    startTransition(() => castVote(start, recipeId, v));
  };

  return (
    <div className={`grid grid-cols-3 gap-2 ${pending ? "opacity-70" : ""}`}>
      {OPTIONS.map((o) => {
        const on = vote === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => choose(o.value)}
            className="rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
            style={
              on
                ? { background: o.color, borderColor: o.color, color: "var(--paper)" }
                : { borderColor: "var(--rule)", color: o.color }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
