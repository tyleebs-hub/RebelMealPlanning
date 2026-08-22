"use client";

import { useTransition } from "react";
import { deleteRecipe } from "@/app/recipes/[id]/actions";

export function DeleteRecipeButton({ recipeId, title }: { recipeId: string; title: string }) {
  const [pending, startT] = useTransition();
  const onClick = () => {
    if (!window.confirm(`Delete "${title}"? This removes it from the library and any planned weeks. This can't be undone.`)) return;
    startT(() => deleteRecipe(recipeId));
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-sm text-[var(--clay-bg)] transition-colors hover:underline disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete recipe"}
    </button>
  );
}
