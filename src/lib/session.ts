import "server-only";
import { cookies } from "next/headers";
import { COOKIE_NAME, verifySession, type Household, type Session, type Who } from "@/lib/auth";

export async function currentSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySession(jar.get(COOKIE_NAME)?.value);
}

export async function currentWho(): Promise<Who | null> {
  return (await currentSession())?.who ?? null;
}

export async function currentHousehold(): Promise<Household | null> {
  return (await currentSession())?.household ?? null;
}

// Any valid session may act — there is no admin tier.
export async function requireAuth(): Promise<void> {
  const s = await currentSession();
  if (!s) throw new Error("Not signed in");
}

// Like requireAuth, but returns the household the caller's writes must be
// scoped to. Server actions use this to keep one household out of another's data.
export async function requireHousehold(): Promise<Household> {
  const s = await currentSession();
  if (!s) throw new Error("Not signed in");
  return s.household;
}
