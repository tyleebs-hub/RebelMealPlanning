import { LUNCH_SERVINGS } from "@/lib/types";
import type { Coverage } from "@/lib/week";

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]";

function Meter({
  label,
  value,
  target,
  color,
  unit,
}: {
  label: string;
  value: number;
  target: number;
  color: string;
  unit: string;
}) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  const done = value >= target;
  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between">
        <span className={EYEBROW}>{label}</span>
        <span className="font-mono text-xs" style={{ color: done ? color : "var(--ink2)" }}>
          {value}/{target} {unit}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--rule2)]">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function CoverageMeters({ coverage, spare }: { coverage: Coverage; spare: number }) {
  const shortBy = Math.max(0, coverage.lunchTarget - coverage.lunchPortions);
  const guidance =
    shortBy > 0
      ? spare >= LUNCH_SERVINGS
        ? `${shortBy} lunch portions short — you have ${spare} spare portions cooked, so assign them to a lunch slot.`
        : `${shortBy} lunch portions short — raise a dinner multiplier or add a prep batch.`
      : null;

  return (
    <div className="rounded-xl border border-[var(--rule)] bg-[var(--card)] p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
        <Meter label="Dinners" value={coverage.dinnersFilled} target={coverage.dinnerTarget} color="var(--go)" unit="filled" />
        <Meter label="Lunch portions" value={coverage.lunchPortions} target={coverage.lunchTarget} color="var(--amber)" unit="covered" />
        <div className="sm:w-32">
          <span className={EYEBROW}>Unassigned</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-medium tabular-nums">{spare}</span>
            <span className="text-xs text-[var(--ink2)]">{spare === 0 ? "none spare" : "cooked, unclaimed"}</span>
          </div>
        </div>
      </div>

      {guidance && (
        <div className="mt-3 flex items-start gap-2 border-t border-[var(--rule2)] pt-3 text-sm text-[var(--ink2)]">
          <span aria-hidden style={{ color: "var(--amber)" }}>→</span>
          <span>{guidance}</span>
        </div>
      )}
    </div>
  );
}
