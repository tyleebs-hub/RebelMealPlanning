import Link from "next/link";
import { mondayOfToday } from "@/lib/week";
import { logout } from "@/app/logout/action";

type Section = "today" | "week" | "recipes" | "grocery" | "vote";

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors sm:text-sm ${
        active
          ? "bg-[var(--card)] text-[var(--ink)]"
          : "text-[var(--ink2)] hover:text-[var(--ink)]"
      }`}
    >
      {label}
    </Link>
  );
}

export function AppHeader({ active }: { active?: Section }) {
  const grocery = `/week/${mondayOfToday()}/grocery`;
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--rule)] bg-[color-mix(in_srgb,var(--paper)_90%,transparent)] backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-1 px-3 py-2 sm:px-4">
        <Link href="/week" className="flex shrink-0 items-center gap-2" aria-label="Leber Family Meals — home">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--ink)]" aria-hidden>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--paper)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2M5 2v20M21 15V2a5 5 0 0 0-3 4.5V12a3 3 0 0 0 3 3zM18 22v-7" />
            </svg>
          </span>
          <span className="hidden font-display text-base sm:inline">Leber Family Meals</span>
        </Link>

        <nav className="flex items-center gap-0">
          <NavLink href="/today" label="Today" active={active === "today"} />
          <NavLink href="/week" label="Week" active={active === "week"} />
          <NavLink href="/recipes" label="Recipes" active={active === "recipes"} />
          <NavLink href={grocery} label="Grocery" active={active === "grocery"} />
          <NavLink href="/vote" label="Vote" active={active === "vote"} />
          <form action={logout}>
            <button aria-label="Sign out" className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[13px] text-[var(--ink2)] transition-colors hover:text-[var(--ink)] sm:text-sm">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
