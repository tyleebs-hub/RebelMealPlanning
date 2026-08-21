"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, SESSION_TTL_MS, passwordOk, signSession } from "@/lib/auth";

export type LoginState = { error?: string };

// Only allow redirecting to internal paths (no open redirects).
function safeNext(next: string): string {
  if (next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/"));

  if (!passwordOk(password)) return { error: "That password didn't work. Try again." };

  // One password, full access. Identity is "tyler" (the household admin);
  // Charity is identified via her signed vote link instead.
  const token = await signSession("tyler");
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  redirect(next); // throws NEXT_REDIRECT
}
