/**
 * One-time: backfill dish photos onto already-imported Paprika recipes.
 * Reads a .paprikarecipes export, matches each recipe to the one already in the
 * DB by title, and uploads its embedded photo to Supabase Storage. Touches only
 * image_path — nothing else. Idempotent: skips recipes that already have a photo.
 *
 *   npm run backfill:photos -- path/to/export.paprikarecipes
 *   npm run backfill:photos -- path/to/export.paprikarecipes --dry
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.
 */
import { readFileSync } from "node:fs";
import { unzipSync, gunzipSync, strFromU8 } from "fflate";
import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import { PHOTO_BUCKET } from "../src/lib/storage";

type PaprikaRecipe = {
  name?: string;
  photo_data?: string; // base64 JPEG (may include a data: prefix)
  image_url?: string;
};

function readArchive(path: string): PaprikaRecipe[] {
  const entries = unzipSync(new Uint8Array(readFileSync(path)));
  const out: PaprikaRecipe[] = [];
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith("/") || data.length === 0) continue;
    if (!/\.paprikarecipe$/i.test(name) && !/\.json$/i.test(name)) continue;
    let json: string;
    try {
      json = strFromU8(gunzipSync(data));
    } catch {
      json = strFromU8(data);
    }
    try {
      out.push(JSON.parse(json) as PaprikaRecipe);
    } catch {
      /* skip */
    }
  }
  return out;
}

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = Buffer.from(clean, "base64");
  return new Uint8Array(bin);
}

const norm = (s: string) => s.trim().toLowerCase();

async function photoBytes(r: PaprikaRecipe): Promise<Uint8Array | null> {
  if (r.photo_data && r.photo_data.length > 100) {
    try {
      return b64ToBytes(r.photo_data);
    } catch {
      /* fall through */
    }
  }
  if (r.image_url && /^https?:\/\//.test(r.image_url)) {
    try {
      const res = await fetch(r.image_url, { signal: AbortSignal.timeout(15000) });
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const archivePath = args.find((a) => !a.startsWith("--"));
  if (!archivePath) {
    console.error("Usage: npm run backfill:photos -- path/to/export.paprikarecipes [--dry]");
    process.exit(1);
  }

  const sb = getSupabaseAdmin();

  // Existing Paprika-import recipes without a photo, grouped by title.
  const { data: rows } = await sb
    .from("recipes")
    .select("id,title,image_path")
    .eq("source_name", "Paprika import");
  const pool = new Map<string, string[]>(); // title -> [ids without image]
  for (const r of (rows ?? []) as { id: string; title: string; image_path: string | null }[]) {
    if (r.image_path) continue;
    const k = norm(r.title);
    (pool.get(k) ?? pool.set(k, []).get(k)!).push(r.id);
  }

  const archive = readArchive(archivePath);
  console.log(`Archive: ${archive.length} recipes. DB has ${[...pool.values()].flat().length} photoless Paprika recipes.`);

  let uploaded = 0,
    noPhoto = 0,
    noMatch = 0;

  for (const r of archive) {
    if (!r.name) continue;
    const ids = pool.get(norm(r.name));
    if (!ids || ids.length === 0) {
      noMatch++;
      continue;
    }
    const bytes = await photoBytes(r);
    if (!bytes) {
      noPhoto++;
      continue;
    }
    const id = ids.shift()!; // claim one match for this title
    if (dry) {
      console.log(`  would set photo: ${r.name} (${bytes.length} bytes)`);
      uploaded++;
      continue;
    }
    const objectPath = `${id}.jpg`;
    const { error: upErr } = await sb.storage
      .from(PHOTO_BUCKET)
      .upload(objectPath, bytes, { contentType: "image/jpeg", upsert: true });
    if (upErr) {
      console.warn(`  ! upload failed for ${r.name}: ${upErr.message}`);
      continue;
    }
    await sb.from("recipes").update({ image_path: `${PHOTO_BUCKET}/${objectPath}` }).eq("id", id);
    uploaded++;
    if (uploaded % 25 === 0) console.log(`  ...${uploaded} photos`);
  }

  console.log(
    `\nDone. ${dry ? "Would upload" : "Uploaded"} ${uploaded} photos. ` +
      `${noPhoto} archive recipes had no photo, ${noMatch} had no matching library recipe.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
