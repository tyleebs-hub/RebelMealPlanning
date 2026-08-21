import type { Coverage } from "@/lib/week";

function Meter({
  label,
  value,
  target,
  unit,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
}) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  const done = value >= target;
  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
          {value}/{target} {unit}
        </span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div
          className={`h-full rounded-full transition-all ${done ? "bg-emerald-500" : "bg-neutral-800 dark:bg-neutral-200"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function CoverageMeters({ coverage }: { coverage: Coverage }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950 sm:flex-row sm:gap-6">
      <Meter
        label="Dinners"
        value={coverage.dinnersFilled}
        target={coverage.dinnerTarget}
        unit="filled"
      />
      <Meter
        label="Lunch portions"
        value={coverage.lunchPortions}
        target={coverage.lunchTarget}
        unit="covered"
      />
    </div>
  );
}
