import Link from "next/link";
import { redirect } from "next/navigation";
import { currentWho } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadWeek } from "@/lib/week-data";
import {
  addDaysIso,
  dateLabelIso,
  dayLabel,
  dayNameOf,
  mondayOf,
  todayIso,
} from "@/lib/week";
import type { Ingredient, Step } from "@/lib/types";
import { publicImageUrl } from "@/lib/storage";
import { DishArt } from "@/components/DishArt";
import { hueForRecipe } from "@/lib/hues";
import { TimeLine } from "@/components/recipe-meta";
import { AppHeader } from "@/components/AppHeader";
import type { Recipe } from "@/lib/types";

export const dynamic = "force-dynamic";

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]";

function ingredientText(i: Ingredient): string {
  if (i.raw_text && i.raw_text.trim()) return i.raw_text.trim();
  const qty = i.qty != null ? String(i.qty) : "";
  return [qty, i.unit ?? "", i.item].filter(Boolean).join(" ").trim();
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const who = await currentWho();
  if (!who) redirect("/login");

  const { d } = await searchParams;
  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayIso();
  const isToday = date === todayIso();
  const monday = mondayOf(date);
  const dayName = dayNameOf(date);

  const { cookEvents, slots } = await loadWeek(monday);
  const eventById = new Map(cookEvents.map((c) => [c.id, c]));
  const dinner = slots.find((s) => s.day === dayName && s.meal === "dinner");
  const lunch = slots.find((s) => s.day === dayName && s.meal === "lunch");

  // Recipes to pull up in full: the dinner cook, plus a lunch that's cooked fresh.
  const cookIds = [dinner, lunch]
    .filter((s) => s?.fill_type === "cook" && s.cook_event_id)
    .map((s) => eventById.get(s!.cook_event_id!)?.recipe_id)
    .filter((x): x is string => Boolean(x));

  const ingredientsBy: Record<string, Ingredient[]> = {};
  const stepsBy: Record<string, Step[]> = {};
  const recipeBy: Record<string, Recipe> = {};
  if (cookIds.length > 0) {
    const sb = getSupabaseAdmin();
    const [{ data: recs }, { data: ings }, { data: steps }] = await Promise.all([
      sb.from("recipes").select("*").in("id", cookIds),
      sb.from("ingredients").select("*").in("recipe_id", cookIds).order("sort_order"),
      sb.from("steps").select("*").in("recipe_id", cookIds).order("sort_order"),
    ]);
    for (const r of (recs ?? []) as Recipe[]) recipeBy[r.id] = r;
    for (const i of (ings ?? []) as Ingredient[]) (ingredientsBy[i.recipe_id] ??= []).push(i);
    for (const s of (steps ?? []) as Step[]) (stepsBy[s.recipe_id] ??= []).push(s);
  }

  const prev = addDaysIso(date, -1);
  const next = addDaysIso(date, 1);

  return (
    <>
      <AppHeader active="today" />
      <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
        <header className="flex items-center justify-between">
          <Link href={`/today?d=${prev}`} className="rounded-lg px-2 py-1 text-lg text-[var(--ink2)] hover:bg-[var(--rule2)] hover:text-[var(--ink)]" aria-label="Previous day">←</Link>
          <div className="text-center">
            <h1 className="font-display text-2xl tracking-tight sm:text-3xl">{dayLabel(dayName)}</h1>
            <p className={`mt-0.5 ${EYEBROW}`}>{isToday ? "today" : dateLabelIso(date)}</p>
          </div>
          <Link href={`/today?d=${next}`} className="rounded-lg px-2 py-1 text-lg text-[var(--ink2)] hover:bg-[var(--rule2)] hover:text-[var(--ink)]" aria-label="Next day">→</Link>
        </header>

        <MealBlock
          label="Dinner"
          slot={dinner}
          event={dinner?.cook_event_id ? eventById.get(dinner.cook_event_id) : undefined}
          recipeBy={recipeBy}
          ingredientsBy={ingredientsBy}
          stepsBy={stepsBy}
        />
        <MealBlock
          label="Lunch"
          slot={lunch}
          event={lunch?.cook_event_id ? eventById.get(lunch.cook_event_id) : undefined}
          recipeBy={recipeBy}
          ingredientsBy={ingredientsBy}
          stepsBy={stepsBy}
        />

        <div className="mt-8 text-center">
          <Link href={`/week/${monday}`} className="text-sm text-[var(--ink2)] underline underline-offset-2 hover:text-[var(--ink)]">
            See the whole week
          </Link>
        </div>
      </main>
    </>
  );
}

type SlotLike = { fill_type: "cook" | "leftover" | "out" | null; out_label: string | null; sauce: string | null } | undefined;
type EventLike = { recipe_id: string; multiplier: number; day: string | null; recipe: { title: string; base_servings: number; image_path: string | null } } | undefined;

function MealBlock({
  label,
  slot,
  event,
  recipeBy,
  ingredientsBy,
  stepsBy,
}: {
  label: string;
  slot: SlotLike;
  event: EventLike;
  recipeBy: Record<string, Recipe>;
  ingredientsBy: Record<string, Ingredient[]>;
  stepsBy: Record<string, Step[]>;
}) {
  if (!slot?.fill_type) {
    return (
      <section className="mt-6 rounded-2xl border border-dashed border-[var(--rule)] p-5">
        <div className={EYEBROW}>{label}</div>
        <p className="mt-1 text-sm text-[var(--ink2)]">Nothing planned.</p>
      </section>
    );
  }

  if (slot.fill_type === "out") {
    return (
      <section className="mt-6 rounded-2xl border border-[var(--rule)] bg-[var(--card)] p-5">
        <div className={EYEBROW}>{label}</div>
        <p className="mt-1 text-lg font-medium">{slot.out_label || "Out"}</p>
      </section>
    );
  }

  const recipe = event ? recipeBy[event.recipe_id] : undefined;
  const title = event?.recipe.title ?? "Leftover";

  if (slot.fill_type === "leftover") {
    return (
      <section className="mt-6 rounded-2xl border border-[var(--rule)] bg-[var(--card)] p-5">
        <div className={EYEBROW}>{label} · leftover</div>
        <p className="mt-1 text-lg font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-[var(--ink2)]">
          from {event?.day ? dayLabel(event.day as never) : "a prep batch"}
          {slot.sauce ? ` · ${slot.sauce}` : ""} · reheat 2 portions
        </p>
        {event && (
          <Link href={`/recipes/${event.recipe_id}`} className="mt-2 inline-block text-sm text-[var(--ink2)] underline underline-offset-2 hover:text-[var(--ink)]">
            view recipe
          </Link>
        )}
      </section>
    );
  }

  // cook — pull the recipe up in full
  const ings = recipe ? ingredientsBy[recipe.id] ?? [] : [];
  const steps = recipe ? stepsBy[recipe.id] ?? [] : [];
  const produced = event ? event.recipe.base_servings * event.multiplier : 0;
  const imageUrl = event ? publicImageUrl(event.recipe.image_path) : null;

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--card)]">
      {imageUrl && <DishArt imageUrl={imageUrl} title={title} hue={hueForRecipe(event!.recipe_id)} />}
      <div className="p-5">
        <div className={EYEBROW}>{label}{event && event.multiplier > 1 ? ` · cooking ${event.multiplier}×` : ""}</div>
        <div className="mt-1 flex items-start justify-between gap-3">
          <h2 className="font-display text-xl leading-tight sm:text-2xl">
            {event ? <Link href={`/recipes/${event.recipe_id}`} className="hover:underline">{title}</Link> : title}
          </h2>
        </div>
        {recipe && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--ink2)]">
            <TimeLine recipe={recipe} />
            <span>· makes {produced} servings</span>
          </div>
        )}

        {ings.length > 0 && (
          <div className="mt-5">
            <h3 className={EYEBROW}>Ingredients{event && event.multiplier > 1 ? ` (base batch — cooking ${event.multiplier}×)` : ""}</h3>
            <ul className="mt-2 flex flex-col">
              {ings.map((ing) => (
                <li key={ing.id} className="flex items-baseline gap-2 border-b border-[var(--rule2)] py-1.5 text-sm">
                  <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--rule)" }} />
                  <span>{ingredientText(ing)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {steps.length > 0 && (
          <div className="mt-5">
            <h3 className={EYEBROW}>Steps</h3>
            <ol className="mt-2 space-y-3">
              {steps.map((s, i) => (
                <li key={s.id} className="flex gap-3 text-sm leading-relaxed">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] font-mono text-xs text-[var(--paper)]">{i + 1}</span>
                  <span className="pt-0.5">{s.body}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
