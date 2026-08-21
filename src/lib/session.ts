import "server-only";
import { cookies } from "next/headers";
import { COOKIE_NAME, verifySession, type Who } from "@/lib/auth";

export async function currentWho(): Promise<Who | null> {
  const jar = await cookies();
  return verifySession(jar.get(COOKIE_NAME)?.value);
}

// Any valid session may act — there is no admin tier.
export async function requireAuth(): Promise<void> {
  const who = await currentWho();
  if (!who) throw new Error("Not signed in");
}
