import "server-only";
import { cookies } from "next/headers";
import { COOKIE_NAME, verifySession, type Role } from "@/lib/auth";

export async function currentRole(): Promise<Role | null> {
  const jar = await cookies();
  return verifySession(jar.get(COOKIE_NAME)?.value);
}

export async function requireAdmin(): Promise<void> {
  const role = await currentRole();
  if (role !== "admin") throw new Error("Forbidden: admin required");
}
