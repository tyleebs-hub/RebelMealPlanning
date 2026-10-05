import { redirect } from "next/navigation";
import { weekStartOfToday } from "@/lib/week";

// Must run per-request so "current week" is computed now, not frozen at build.
export const dynamic = "force-dynamic";

export default function WeekIndex() {
  redirect(`/week/${weekStartOfToday()}`);
}
