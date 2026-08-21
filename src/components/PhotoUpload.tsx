"use client";

import { useRef, useState, useTransition } from "react";
import { uploadRecipePhoto, removeRecipePhoto } from "@/app/recipes/actions";

// Resize to max 1200px on the longest edge, re-encode as JPEG, before upload
// (a 1 GB free tier disappears fast if 3 MB phone originals go straight through).
async function resize(file: File, max = 1200): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("resize failed"))), "image/jpeg", 0.85),
  );
}

export function PhotoUpload({ recipeId, hasPhoto }: { recipeId: string; hasPhoto: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const blob = await resize(file);
      const fd = new FormData();
      fd.append("photo", blob, "photo.jpg");
      startTransition(() => uploadRecipePhoto(recipeId, fd));
    } catch {
      setError("Could not process that image.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onFile}
        className="hidden"
        id={`photo-${recipeId}`}
      />
      <label
        htmlFor={`photo-${recipeId}`}
        className="cursor-pointer rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        {pending ? "Uploading…" : hasPhoto ? "Replace photo" : "Add photo"}
      </label>
      {hasPhoto && !pending && (
        <button
          type="button"
          onClick={() => startTransition(() => removeRecipePhoto(recipeId))}
          className="text-sm text-neutral-400 hover:text-red-600"
        >
          Remove
        </button>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
