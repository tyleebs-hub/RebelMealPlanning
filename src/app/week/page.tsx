import { redirect } from "next/navigation";
import { tzFor, weekStartOfToday } from "@/lib/week";
import { currentHousehold } from "@/lib/session";

// Must run per-request so "current week" is computed now, not frozen at build.
export const dynamic = "force-dynamic";

export default async function WeekIndex() {
  const household = (await currentHousehold()) ?? "leber";
  redirect(`/week/${weekStartOfToday(tzFor(household))}`);
}
