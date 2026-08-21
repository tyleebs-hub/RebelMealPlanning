import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadWeek } from "@/lib/week-data";
import { formatWeekRange, isMonday, mondayOfToday } from "@/lib/week";
import type { GroceryIngredient } from "@/lib/grocery";
import { GroceryList } from "@/components/week/GroceryList";

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
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <div className="flex items-center justify-between">
        <Link href={`/week/${start}`} className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200">
          ← Week
        </Link>
      </div>
      <h1 className="mt-3 text-lg font-bold tracking-tight sm:text-xl">
        Groceries · {formatWeekRange(start)}
      </h1>

      {events.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">
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
  );
}
