"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dayLabel, type Day } from "@/lib/week";
import { planChat, addChatMeal } from "@/app/week/[start]/ai-actions";
import type { ChatMessage } from "@/lib/ai/client";
import type { ChatMeal } from "@/lib/ai/validate";

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]";
const EXAMPLE = "Petite sirloin & Birds Eye veggies are on sale — turn that into a couple dinners/lunches?";

type DisplayMsg = { role: "user" | "assistant"; content: string; suggestions?: ChatMeal[] };

export function PlanChat({ start }: { start: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMsg[]>([]);
  const [input, setInput] = useState("");
  const [added, setAdded] = useState<Record<string, string>>({}); // key -> "adding" | "done"
  const [pending, startT] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || pending) return;
    const next: DisplayMsg[] = [...messages, { role: "user", content: t }];
    setMessages(next);
    setInput("");
    startT(async () => {
      const history: ChatMessage[] = next.map((m) => ({ role: m.role, content: m.content }));
      const res = await planChat(start, history);
      setMessages((m) => [
        ...m,
        res.ok
          ? { role: "assistant", content: res.reply, suggestions: res.suggestions }
          : { role: "assistant", content: `⚠︎ ${res.error}` },
      ]);
    });
  };

  const add = (key: string, meal: ChatMeal) => {
    setAdded((a) => ({ ...a, [key]: "adding" }));
    startT(async () => {
      const res = await addChatMeal(start, meal);
      setAdded((a) => ({ ...a, [key]: res.ok ? "done" : "err" }));
      if (res.ok) router.refresh();
    });
  };

  return (
    <section className="mt-8 overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--card)]">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span>
          <span className={EYEBROW}>Meal ideas</span>
          <span className="mt-0.5 block text-sm text-[var(--ink2)]">Brainstorm with what&apos;s on sale or in the fridge — and add ideas with a tap.</span>
        </span>
        <span aria-hidden className="text-[var(--ink2)]">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--rule)]">
          <div ref={scrollRef} className="max-h-[46vh] overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <div className="py-4 text-center">
                <p className="text-sm text-[var(--ink2)]">Ask for dinner or lunch ideas for this week&apos;s open slots.</p>
                <button onClick={() => send(EXAMPLE)} className="mt-3 rounded-full border border-[var(--rule)] px-3 py-1.5 text-xs text-[var(--ink2)] hover:border-[var(--ink2)] hover:text-[var(--ink)]">
                  “{EXAMPLE}”
                </button>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {messages.map((m, mi) => (
                  <li key={mi} className={m.role === "user" ? "flex flex-col items-end" : "flex flex-col items-start"}>
                    <div
                      className={
                        m.role === "user"
                          ? "max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--ink)] px-3 py-2 text-sm text-[var(--paper)]"
                          : "max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-sm"
                      }
                    >
                      {m.content}
                    </div>
                    {m.suggestions && m.suggestions.length > 0 && (
                      <div className="mt-2 flex max-w-[95%] flex-wrap gap-1.5">
                        {m.suggestions.map((s) => {
                          const key = `${mi}:${s.id}`;
                          const state = added[key];
                          return (
                            <button
                              key={key}
                              onClick={() => add(key, s)}
                              disabled={!!state && state !== "err"}
                              className="rounded-lg border border-[var(--rule)] bg-[var(--card)] px-2.5 py-1.5 text-xs hover:border-[var(--ink2)] disabled:opacity-70"
                              style={state === "done" ? { borderColor: "var(--go)", color: "var(--go)" } : undefined}
                            >
                              {state === "done" ? "✓ " : state === "adding" ? "…" : "➕ "}
                              Add <span className="font-medium">{s.title}</span>{s.isNew ? " (new)" : ""} to {dayLabel(s.day as Day)} {s.meal}
                              {s.multiplier > 1 ? ` ×${s.multiplier}` : ""}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </li>
                ))}
                {pending && (
                  <li className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-sm border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink2)]">Thinking…</div>
                  </li>
                )}
              </ul>
            )}
          </div>

          <div className="flex gap-2 border-t border-[var(--rule)] p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder="e.g. what can I do with ground turkey?"
              className="min-w-0 flex-1 rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-sm"
            />
            <button onClick={() => send(input)} disabled={pending || !input.trim()} className="shrink-0 rounded-lg bg-[var(--ink)] px-3 py-2 text-sm font-medium text-[var(--paper)] hover:opacity-90 disabled:opacity-50">
              Send
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
