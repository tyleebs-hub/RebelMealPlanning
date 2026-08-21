"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="mt-6 flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <input
        type="password"
        name="password"
        autoFocus
        autoComplete="current-password"
        enterKeyHint="go"
        placeholder="Password"
        className="rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
      />
      {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-3 py-2.5 text-base font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {pending ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}
