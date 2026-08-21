// Dish photo storage. See CLAUDE.md > Photo upload (phase 8).

export const PHOTO_BUCKET = "dish-photos";

// image_path is stored as "dish-photos/<file>" (the path after /public/).
export function publicImageUrl(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${imagePath}`;
}
