"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME } from "@/lib/auth";

// A server action (POST), NOT a GET route — a GET logout gets prefetched by
// <Link>, which would silently clear the session. See the Sign out buttons.
export async function logout() {
  (await cookies()).delete(COOKIE_NAME);
  redirect("/login");
}
