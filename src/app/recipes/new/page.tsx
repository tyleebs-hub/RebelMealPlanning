import Link from "next/link";
import { createRecipe } from "./actions";
import { RecipeForm, EMPTY_RECIPE } from "@/components/RecipeForm";
import { AppHeader } from "@/components/AppHeader";

export default function NewRecipePage() {
  return (
    <>
      <AppHeader active="recipes" />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <Link href="/recipes" className="text-sm text-[var(--ink2)] transition-colors hover:text-[var(--ink)]">
          ← Recipes
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Add a recipe</h1>
        <RecipeForm action={createRecipe} initial={EMPTY_RECIPE} showImport submitLabel="Save recipe" />
      </main>
    </>
  );
}
