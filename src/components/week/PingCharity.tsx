"use client";

import { useState, useTransition } from "react";
import { pingCharity } from "@/app/week/[start]/actions";

export function PingCharity() {
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const generate = () => {
    startTransition(async () => {
      const { message } = await pingCharity();
      setMsg(message);
      setCopied(false);
    });
  };

  const copy = async () => {
    if (!msg) return;
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={generate}
        disabled={pending}
        className="self-start rounded-lg border border-neutral-300 px-2.5 py-1 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        {pending ? "Generating…" : "Ping Charity"}
      </button>
      {msg && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-900">
          <p className="break-words text-neutral-700 dark:text-neutral-300">{msg}</p>
          <button
            type="button"
            onClick={copy}
            className="mt-2 rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {copied ? "Copied!" : "Copy message"}
          </button>
        </div>
      )}
    </div>
  );
}
