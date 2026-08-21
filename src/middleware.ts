import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, SESSION_TTL_MS, isAuthConfigured, verifySession } from "@/lib/auth";

// Reachable without a session.
const PUBLIC_PATHS = ["/login", "/logout"];

export async function middleware(req: NextRequest) {
  // Gate is inert until AUTH_SECRET + a password are set.
  if (!isAuthConfigured()) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Vote link: /vote/<token> sets the session cookie (identity = charity) and
  // lands on the voting view. Charity arrives with no cookie.
  const voteToken = pathname.match(/^\/vote\/(.+)$/);
  if (voteToken) {
    // Already signed in? Don't overwrite the session.
    const existing = await verifySession(req.cookies.get(COOKIE_NAME)?.value);
    if (existing) return NextResponse.redirect(new URL("/vote", req.url));

    const token = decodeURIComponent(voteToken[1]);
    const who = await verifySession(token);
    if (who) {
      const res = NextResponse.redirect(new URL("/vote", req.url));
      res.cookies.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: Math.floor(SESSION_TTL_MS / 1000),
      });
      return res;
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Any valid session has full access; no session redirects to login.
  const who = await verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!who) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
