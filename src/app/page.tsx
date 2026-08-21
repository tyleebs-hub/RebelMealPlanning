import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { COOKIE_NAME, isAuthConfigured, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Before auth is configured, behave like the pre-auth phases.
  if (!isAuthConfigured()) redirect("/recipes");

  const jar = await cookies();
  const role = await verifySession(jar.get(COOKIE_NAME)?.value);
  // Middleware guarantees a session here, but guard anyway.
  if (!role) redirect("/login");

  const isAdmin = role === "admin";

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-start justify-between">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Meal Planner</h1>
        <Link
          href="/logout"
          className="text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-neutral-200"
        >
          Sign out
        </Link>
      </div>

      <nav className="mt-8 flex flex-col gap-3">
        {isAdmin ? (
          <Link
            href="/recipes"
            className="rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-600 dark:hover:bg-neutral-900"
          >
            <span className="text-lg font-semibold">Recipe Library</span>
            <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
              Browse and manage the household cookbook.
            </p>
          </Link>
        ) : (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
            You&apos;re signed in. The week view and voting are coming soon.
          </div>
        )}
      </nav>
    </main>
  );
}
