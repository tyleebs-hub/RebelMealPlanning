import { redirect } from "next/navigation";
import { mondayOfToday } from "@/lib/week";

export default function WeekIndex() {
  redirect(`/week/${mondayOfToday()}`);
}
