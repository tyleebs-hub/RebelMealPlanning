"use client";

import { useState, useTransition } from "react";
import { castVote } from "@/app/week/[start]/actions";

type Vote = "yes" | "sure" | "pass";

const OPTIONS: { value: Vote; label: string }[] = [
  { value: "yes", label: "Yes!" },
  { value: "sure", label: "Sure" },
  { value: "pass", label: "Pass" },
];

const ACTIVE: Record<Vote, string> = {
  yes: "bg-emerald-600 text-white border-emerald-600",
  sure: "bg-amber-500 text-white border-amber-500",
  pass: "bg-neutral-500 text-white border-neutral-500",
};

export function VoteButtons({
  suggestionId,
  current,
}: {
  suggestionId: string;
  current: Vote | null;
}) {
  const [vote, setVote] = useState<Vote | null>(current);
  const [pending, startTransition] = useTransition();

  const choose = (v: Vote) => {
    setVote(v);
    startTransition(() => castVote(suggestionId, v));
  };

  return (
    <div className={`inline-flex overflow-hidden rounded-lg border border-neutral-300 dark:border-neutral-700 ${pending ? "opacity-60" : ""}`}>
      {OPTIONS.map((o, i) => (
        <button
          key={o.value}
          type="button"
          onClick={() => choose(o.value)}
          className={`px-3 py-1.5 text-sm font-medium ${i > 0 ? "border-l border-neutral-300 dark:border-neutral-700" : ""} ${
            vote === o.value ? ACTIVE[o.value] : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
