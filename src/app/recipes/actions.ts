"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireHousehold } from "@/lib/session";
import { PHOTO_BUCKET } from "@/lib/storage";
import type { SupabaseClient } from "@supabase/supabase-js";

// Storage objects can be shared between recipes (Mom's library is seeded as a
// copy of Leber's and the copies point at the same image). Only delete the file
// once no recipe row references it any more, or one household's photo change
// would break the other's image.
async function removeImageIfOrphaned(sb: SupabaseClient, path: string | null) {
  if (!path || !path.startsWith(`${PHOTO_BUCKET}/`)) return;
  const { count } = await sb
    .from("recipes")
    .select("id", { count: "exact", head: true })
    .eq("image_path", path);
  if ((count ?? 0) > 0) return; // still referenced elsewhere
  await sb.storage.from(PHOTO_BUCKET).remove([path.slice(PHOTO_BUCKET.length + 1)]);
}

// Upload a (client-resized) dish photo. See CLAUDE.md > Photo upload.
export async function uploadRecipePhoto(recipeId: string, formData: FormData) {
  const household = await requireHousehold();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return;

  const sb = getSupabaseAdmin();

  // Confirm ownership and grab any previous photo for this recipe.
  const { data: existing } = await sb
    .from("recipes")
    .select("image_path,household_id")
    .eq("id", recipeId)
    .single();
  if (!existing || existing.household_id !== household) return;
  const oldPath: string | null = existing.image_path ?? null;

  const objectPath = `${recipeId}-${Date.now()}.jpg`;
  const buf = await file.arrayBuffer();
  const { error: upErr } = await sb.storage
    .from(PHOTO_BUCKET)
    .upload(objectPath, buf, { contentType: "image/jpeg", upsert: false });
  if (upErr) throw upErr;

  await sb.from("recipes").update({ image_path: `${PHOTO_BUCKET}/${objectPath}` }).eq("id", recipeId);

  await removeImageIfOrphaned(sb, oldPath);

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
}

export async function removeRecipePhoto(recipeId: string) {
  const household = await requireHousehold();
  const sb = getSupabaseAdmin();
  const { data: existing } = await sb
    .from("recipes")
    .select("image_path,household_id")
    .eq("id", recipeId)
    .single();
  if (!existing || existing.household_id !== household) return;
  const oldPath: string | null = existing.image_path ?? null;
  await sb.from("recipes").update({ image_path: null }).eq("id", recipeId);
  await removeImageIfOrphaned(sb, oldPath);
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
}
