"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/session";
import { PHOTO_BUCKET } from "@/lib/storage";

// Upload a (client-resized) dish photo. See CLAUDE.md > Photo upload.
export async function uploadRecipePhoto(recipeId: string, formData: FormData) {
  await requireAdmin();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return;

  const sb = getSupabaseAdmin();

  // Remove any previous photo for this recipe.
  const { data: existing } = await sb
    .from("recipes")
    .select("image_path")
    .eq("id", recipeId)
    .single();
  const oldPath: string | null = existing?.image_path ?? null;

  const objectPath = `${recipeId}-${Date.now()}.jpg`;
  const buf = await file.arrayBuffer();
  const { error: upErr } = await sb.storage
    .from(PHOTO_BUCKET)
    .upload(objectPath, buf, { contentType: "image/jpeg", upsert: false });
  if (upErr) throw upErr;

  await sb.from("recipes").update({ image_path: `${PHOTO_BUCKET}/${objectPath}` }).eq("id", recipeId);

  if (oldPath && oldPath.startsWith(`${PHOTO_BUCKET}/`)) {
    await sb.storage.from(PHOTO_BUCKET).remove([oldPath.slice(PHOTO_BUCKET.length + 1)]);
  }

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
}

export async function removeRecipePhoto(recipeId: string) {
  await requireAdmin();
  const sb = getSupabaseAdmin();
  const { data: existing } = await sb
    .from("recipes")
    .select("image_path")
    .eq("id", recipeId)
    .single();
  const oldPath: string | null = existing?.image_path ?? null;
  await sb.from("recipes").update({ image_path: null }).eq("id", recipeId);
  if (oldPath && oldPath.startsWith(`${PHOTO_BUCKET}/`)) {
    await sb.storage.from(PHOTO_BUCKET).remove([oldPath.slice(PHOTO_BUCKET.length + 1)]);
  }
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
}
