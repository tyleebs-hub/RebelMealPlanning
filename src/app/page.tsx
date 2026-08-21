import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { COOKIE_NAME, isAuthConfigured, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Before auth is configured, behave like the pre-auth phases.
  if (!isAuthConfigured()) redirect("/recipes");

  const jar = await cookies();
  const role = await verifySession(jar.get(COOKIE_NAME)?.value);
  if (!role) redirect("/login");

  // Admin lands on the planner; household lands on this week's voting/record.
  redirect(role === "admin" ? "/week" : "/vote");
}
