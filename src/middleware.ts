import { NextResponse, type NextRequest } from "next/server";
import {
  COOKIE_NAME,
  SESSION_TTL_MS,
  isAuthConfigured,
  verifySession,
  roleAllows,
} from "@/lib/auth";

// Routes reachable without a session.
const PUBLIC_PATHS = ["/login", "/logout"];

// Paths that require the admin role (the recipe library and, later, week
// editing + grocery generation). See CLAUDE.md > Auth.
const ADMIN_PREFIXES = ["/recipes", "/week"];

export async function middleware(req: NextRequest) {
  // Gate is inert until AUTH_SECRET + HOUSEHOLD_PASSWORD are set.
  if (!isAuthConfigured()) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Vote link: /vote/<token> sets the household cookie and lands on the voting
  // view. Charity arrives here with no cookie (see CLAUDE.md > Auth).
  const voteToken = pathname.match(/^\/vote\/(.+)$/);
  if (voteToken) {
    // If already signed in, don't overwrite the session — e.g. Tyler (admin)
    // previewing the link should stay admin, not get downgraded to household.
    const existing = await verifySession(req.cookies.get(COOKIE_NAME)?.value);
    if (existing) return NextResponse.redirect(new URL("/vote", req.url));

    const token = decodeURIComponent(voteToken[1]);
    const role = await verifySession(token);
    if (role) {
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

  const role = await verifySession(req.cookies.get(COOKIE_NAME)?.value);

  if (!role) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (ADMIN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (!roleAllows(role, "admin")) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
