"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, SESSION_TTL_MS, roleForPassword, signSession } from "@/lib/auth";

// Only allow redirecting to internal paths (no open redirects).
function safeNext(next: string): string {
  if (next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/"));

  const role = roleForPassword(password);
  if (!role) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const token = await signSession(role);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  redirect(next);
}
