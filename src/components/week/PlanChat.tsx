"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { planChat } from "@/app/week/[start]/ai-actions";
import type { ChatMessage } from "@/lib/ai/client";

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]";
const EXAMPLE = "Petite sirloin & Birds Eye veggies are on sale — turn that into a couple dinners/lunches?";

export function PlanChat({ start }: { start: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, startT] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || pending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: t }];
    setMessages(next);
    setInput("");
    startT(async () => {
      const res = await planChat(start, next);
      setMessages((m) => [...m, { role: "assistant", content: res.ok ? res.reply : `⚠︎ ${res.error}` }]);
    });
  };

  return (
    <section className="mt-8 overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--card)]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span>
          <span className={EYEBROW}>Meal ideas</span>
          <span className="mt-0.5 block text-sm text-[var(--ink2)]">Brainstorm with what&apos;s on sale or in the fridge.</span>
        </span>
        <span aria-hidden className="text-[var(--ink2)]">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--rule)]">
          <div ref={scrollRef} className="max-h-[42vh] overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <div className="py-4 text-center">
                <p className="text-sm text-[var(--ink2)]">Ask for dinner or lunch ideas for this week&apos;s open slots.</p>
                <button
                  onClick={() => send(EXAMPLE)}
                  className="mt-3 rounded-full border border-[var(--rule)] px-3 py-1.5 text-xs text-[var(--ink2)] hover:border-[var(--ink2)] hover:text-[var(--ink)]"
                >
                  “{EXAMPLE}”
                </button>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {messages.map((m, i) => (
                  <li key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={
                        m.role === "user"
                          ? "max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--ink)] px-3 py-2 text-sm text-[var(--paper)]"
                          : "max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-sm"
                      }
                    >
                      {m.content}
                    </div>
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
            <button
              onClick={() => send(input)}
              disabled={pending || !input.trim()}
              className="shrink-0 rounded-lg bg-[var(--ink)] px-3 py-2 text-sm font-medium text-[var(--paper)] hover:opacity-90 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
