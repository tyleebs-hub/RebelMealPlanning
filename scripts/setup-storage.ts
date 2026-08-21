/**
 * One-time: create the public "dish-photos" storage bucket.
 *   npm run setup:storage
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.
 */
import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import { PHOTO_BUCKET } from "../src/lib/storage";

async function main() {
  const sb = getSupabaseAdmin();
  const { data: buckets } = await sb.storage.listBuckets();
  if (buckets?.some((b) => b.name === PHOTO_BUCKET)) {
    console.log(`Bucket "${PHOTO_BUCKET}" already exists.`);
    return;
  }
  const { error } = await sb.storage.createBucket(PHOTO_BUCKET, {
    public: true,
    fileSizeLimit: "5MB",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (error) throw error;
  console.log(`Created public bucket "${PHOTO_BUCKET}".`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
