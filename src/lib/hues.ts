// Cook-event hues. Assigned by cook-event index within a week (not stored in
// the DB). The dinner cook and every lunch riding on it share the same hue as
// a left border — the signature color-tracing. See DESIGN.md.
// Values are CSS var() references so they adapt to the active theme.

export type Hue = { key: string; bg: string; soft: string; text: string };

export const HUES: Hue[] = [
  { key: "teal", bg: "var(--teal-bg)", soft: "var(--teal-soft)", text: "var(--teal-text)" },
  { key: "amber", bg: "var(--amber-bg)", soft: "var(--amber-soft)", text: "var(--amber-text)" },
  { key: "plum", bg: "var(--plum-bg)", soft: "var(--plum-soft)", text: "var(--plum-text)" },
  { key: "olive", bg: "var(--olive-bg)", soft: "var(--olive-soft)", text: "var(--olive-text)" },
  { key: "clay", bg: "var(--clay-bg)", soft: "var(--clay-soft)", text: "var(--clay-text)" },
];

export function hueForIndex(i: number): Hue {
  return HUES[((i % HUES.length) + HUES.length) % HUES.length];
}

// Deterministic hue per recipe (for placeholder dish art), derived from its id.
export function hueForRecipe(id: string): Hue {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return hueForIndex(h);
}

// Stable ordering for hue assignment: by day (mon..sun), then dinner before
// prep, then id — so the same week always colors the same way.
const DAY_ORDER: Record<string, number> = {
  mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6,
};

export function hueMapForEvents(
  events: { id: string; day: string | null; kind: string }[],
): Map<string, Hue> {
  const ordered = [...events].sort((a, b) => {
    const da = a.day ? DAY_ORDER[a.day] ?? 99 : 99;
    const db = b.day ? DAY_ORDER[b.day] ?? 99 : 99;
    if (da !== db) return da - db;
    if (a.kind !== b.kind) return a.kind === "dinner" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  const map = new Map<string, Hue>();
  ordered.forEach((e, i) => map.set(e.id, hueForIndex(i)));
  return map;
}
