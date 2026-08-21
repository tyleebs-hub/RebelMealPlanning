import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, isAuthConfigured, verifySession, roleAllows } from "@/lib/auth";

// Routes reachable without a session.
const PUBLIC_PATHS = ["/login", "/logout"];

// Paths that require the admin role (the recipe library and, later, week
// editing + grocery generation). See CLAUDE.md > Auth.
const ADMIN_PREFIXES = ["/recipes"];

export async function middleware(req: NextRequest) {
  // Gate is inert until AUTH_SECRET + HOUSEHOLD_PASSWORD are set.
  if (!isAuthConfigured()) return NextResponse.next();

  const { pathname } = req.nextUrl;
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
