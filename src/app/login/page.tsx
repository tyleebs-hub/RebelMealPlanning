import { login } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Meal Planner</h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Enter the household password.
      </p>

      <form action={login} className="mt-6 flex flex-col gap-3">
        <input type="hidden" name="next" value={next ?? "/"} />
        <input
          type="password"
          name="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Password"
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
        />
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            That password didn&apos;t work. Try again.
          </p>
        )}
        <button
          type="submit"
          className="rounded-lg bg-neutral-900 px-3 py-2.5 text-base font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Enter
        </button>
      </form>
    </main>
  );
}
