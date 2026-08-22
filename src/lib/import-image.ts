import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET } from "@/lib/storage";

// Basic SSRF guard: only public http(s) hosts.
function safeImageUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "127.0.0.1" ||
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    host.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return null;
  }
  return u;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};
const MAX_BYTES = 8_000_000; // skip pathologically large source images

// Download a recipe's hero image from its (public) URL and store it in the photo
// bucket, setting recipes.image_path. Best-effort: returns false on any problem
// (never throws) so a bad image can't block saving the recipe.
export async function importImageFromUrl(
  sb: SupabaseClient,
  recipeId: string,
  rawUrl: string,
): Promise<boolean> {
  try {
    const url = safeImageUrl(rawUrl);
    if (!url) return false;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (MealPlanner recipe import)" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return false;

    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const ext = EXT[ct];
    if (!ext) return false;

    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return false;

    const objectPath = `${recipeId}-${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage
      .from(PHOTO_BUCKET)
      .upload(objectPath, buf, { contentType: ct, upsert: false });
    if (upErr) return false;

    await sb.from("recipes").update({ image_path: `${PHOTO_BUCKET}/${objectPath}` }).eq("id", recipeId);
    return true;
  } catch {
    return false;
  }
}
