import Link from "next/link";
import { money, type WeeklyCost } from "@/lib/cost";

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink2)]";

export function CostPanel({ start, cost }: { start: string; cost: WeeklyCost }) {
  return (
    <div className="mt-3 flex items-baseline gap-2 px-1">
      <span className={EYEBROW}>Week total</span>
      <span className="font-mono text-lg font-medium tabular-nums">{money(cost.total)}</span>
      {cost.unpricedCooks > 0 && (
        <Link
          href={`/week/${start}/grocery`}
          className="font-mono text-[10px] text-[var(--ink2)] underline underline-offset-2 hover:text-[var(--ink)]"
        >
          {cost.unpricedCooks} unpriced
        </Link>
      )}
    </div>
  );
}
