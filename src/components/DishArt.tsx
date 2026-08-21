import type { Hue } from "@/lib/hues";

// A photo when we have one, otherwise a deliberate placeholder derived from the
// recipe's hue: soft field, concentric circles, first letter in Bricolage.
export function DishArt({
  imageUrl,
  title,
  hue,
  tall,
}: {
  imageUrl?: string | null;
  title: string;
  hue: Hue;
  tall?: boolean;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={title}
        className={
          tall
            ? // detail / vote: show the whole photo, no crop, capped height
              "block max-h-[70vh] w-full object-contain"
            : // library tiles: gentle 4:3 crop instead of a tight zoom
              "block aspect-[4/3] w-full object-cover"
        }
      />
    );
  }
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${tall ? "aspect-[16/9]" : "aspect-[4/3]"}`}
      style={{ background: hue.soft }}
    >
      <svg viewBox="0 0 120 80" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <circle cx="60" cy="40" r="26" fill="none" stroke={hue.bg} strokeWidth="1.25" opacity="0.5" />
        <circle cx="60" cy="40" r="17" fill={hue.bg} opacity="0.16" />
        <circle cx="60" cy="40" r="8" fill={hue.bg} opacity="0.3" />
      </svg>
      <span
        className="relative font-display"
        style={{ color: hue.bg, fontSize: tall ? 40 : 30, opacity: 0.85 }}
      >
        {title.trim()[0]?.toUpperCase() ?? "?"}
      </span>
    </div>
  );
}
