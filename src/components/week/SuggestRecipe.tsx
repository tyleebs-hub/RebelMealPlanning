"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { suggestRecipe } from "@/app/week/[start]/actions";

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]";

export function SuggestRecipe({ start }: { start: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startT] = useTransition();
  const router = useRouter();

  const submit = () => {
    if (!url.trim()) return;
    setMsg(null);
    startT(async () => {
      const res = await suggestRecipe(start, url, note);
      if (res.ok) {
        setMsg({ ok: true, text: `Added "${res.title}" — Tyler will see it on the plan.` });
        setUrl("");
        setNote("");
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  };

  return (
    <section className="mt-8 rounded-2xl border border-[var(--rule)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className={EYEBROW}>Got an idea?</h2>
          <p className="mt-0.5 text-sm text-[var(--ink2)]">Paste a recipe link and Tyler will see it.</p>
        </div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-lg bg-[var(--ink)] px-3 py-2 text-sm font-medium text-[var(--paper)] hover:opacity-90"
          >
            Suggest a recipe
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-2.5">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="https://..."
            inputMode="url"
            autoFocus
            className="w-full rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-sm"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Note for Tyler (optional)"
            className="w-full rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={submit}
              disabled={pending || !url.trim()}
              className="rounded-lg bg-[var(--go)] px-3 py-2 text-sm font-medium text-[var(--paper)] hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Adding..." : "Send it over"}
            </button>
            <button
              onClick={() => { setOpen(false); setMsg(null); }}
              className="rounded-lg border border-[var(--rule)] px-3 py-2 text-sm hover:bg-[var(--rule2)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p
          className="mt-2.5 text-sm"
          style={{ color: msg.ok ? "var(--go)" : "var(--clay-bg)" }}
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}
