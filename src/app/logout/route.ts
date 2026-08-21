import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
  return NextResponse.redirect(new URL("/login", req.url));
}
