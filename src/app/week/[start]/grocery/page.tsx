import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadWeek } from "@/lib/week-data";
import { addDaysIso, formatWeekRange, isMonday, mondayOfToday } from "@/lib/week";
import type { GroceryIngredient } from "@/lib/grocery";
import { GroceryList } from "@/components/week/GroceryList";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

export default async function GroceryPage({ params }: { params: Promise<{ start: string }> }) {
  const { start } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !isMonday(start)) {
    redirect(`/week/${mondayOfToday()}/grocery`);
  }

  const { weekId, cookEvents } = await loadWeek(start);
  const sb = getSupabaseAdmin();

  const recipeIds = [...new Set(cookEvents.map((c) => c.recipe_id))];
  const ingredientsByRecipe: Record<string, GroceryIngredient[]> = {};
  if (recipeIds.length > 0) {
    const { data } = await sb
      .from("ingredients")
      .select("recipe_id,qty,unit,item,aisle,is_pantry_staple")
      .in("recipe_id", recipeIds)
      .order("sort_order");
    for (const ing of (data ?? []) as GroceryIngredient[]) {
      (ingredientsByRecipe[ing.recipe_id] ??= []).push(ing);
    }
  }

  const { data: checkData } = await sb
    .from("grocery_checks")
    .select("item_key,checked")
    .eq("week_id", weekId);
  const initialChecks: Record<string, boolean> = {};
  for (const c of (checkData ?? []) as { item_key: string; checked: boolean }[]) {
    initialChecks[c.item_key] = c.checked;
  }

  const events = cookEvents.map((c) => ({
    id: c.id,
    recipe_id: c.recipe_id,
    multiplier: c.multiplier,
    title: c.recipe.title,
    kind: c.kind,
  }));

  return (
    <>
      <AppHeader active="grocery" />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <Link href={`/week/${start}`} className="text-sm text-[var(--ink2)] transition-colors hover:text-[var(--ink)]">
          ← Week
        </Link>
        <header className="mt-2 flex items-center justify-between">
          <Link href={`/week/${addDaysIso(start, -7)}/grocery`} className="rounded-lg px-2 py-1 text-lg text-[var(--ink2)] hover:bg-[var(--rule2)] hover:text-[var(--ink)]" aria-label="Previous week">←</Link>
          <div className="text-center">
            <h1 className="font-display text-xl tracking-tight sm:text-2xl">Groceries</h1>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]">{formatWeekRange(start)}</p>
          </div>
          <Link href={`/week/${addDaysIso(start, 7)}/grocery`} className="rounded-lg px-2 py-1 text-lg text-[var(--ink2)] hover:bg-[var(--rule2)] hover:text-[var(--ink)]" aria-label="Next week">→</Link>
        </header>

        {events.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--ink2)]">
            No cooks planned for this week yet. Add some on the{" "}
            <Link href={`/week/${start}`} className="underline">
              week view
            </Link>
            .
          </p>
        ) : (
          <GroceryList
            start={start}
            events={events}
            ingredientsByRecipe={ingredientsByRecipe}
            initialChecks={initialChecks}
          />
        )}
      </main>
    </>
  );
}
