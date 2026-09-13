// Household auth. A password gets you in; after that, full access to your own
// household — there is no admin tier. The cookie carries an identity (who) so
// votes/ratings can be attributed, and a household (leber or mom) that scopes
// every plan, price, and setting. Charity arrives via a signed /vote/<token>
// link and never types a password. See CLAUDE.md > Auth.
//
// Signing uses Web Crypto (HMAC-SHA256) so the same code runs in both the Edge
// middleware and Node server actions.

export type Who = "tyler" | "charity" | "mom";
export type Household = "leber" | "mom";
export type Session = { who: Who; household: Household };

export const COOKIE_NAME = "mp_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 400; // ~400d (browser cap)

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

// Each configured password maps to the session it grants. HOUSEHOLD_PASSWORD and
// ADMIN_PASSWORD both sign in as the Leber household; MOM_PASSWORD signs in as
// Mom's. (There is still no admin tier — the two Leber vars are historical.)
function credentials(): { password: string; session: Session }[] {
  const out: { password: string; session: Session }[] = [];
  for (const name of ["HOUSEHOLD_PASSWORD", "ADMIN_PASSWORD"]) {
    const v = env(name);
    if (v) out.push({ password: v, session: { who: "tyler", household: "leber" } });
  }
  const mom = env("MOM_PASSWORD");
  if (mom) out.push({ password: mom, session: { who: "mom", household: "mom" } });
  return out;
}

// The gate is only active once a signing secret and a password exist. Until
// then the site is open, avoiding a lockout before env vars are set.
export function isAuthConfigured(): boolean {
  return Boolean(env("AUTH_SECRET") && credentials().length > 0);
}

// ---- base64url helpers (Edge + Node safe) -----------------------------------
function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function strToB64url(s: string): string {
  return bytesToB64url(new TextEncoder().encode(s));
}
function b64urlToStr(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ---- HMAC signing -----------------------------------------------------------
async function hmac(payloadB64: string): Promise<string> {
  const secret = env("AUTH_SECRET");
  if (!secret) throw new Error("AUTH_SECRET not set");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return bytesToB64url(new Uint8Array(sig));
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// ---- session tokens ---------------------------------------------------------
// hh is optional on the wire: tokens minted before multi-household lack it and
// resolve to the Leber household, so existing sessions keep working.
type Payload = { who: Who; hh?: Household; exp: number };

export async function signSession(
  who: Who,
  household: Household,
  ttlMs = SESSION_TTL_MS,
): Promise<string> {
  const payload: Payload = { who, hh: household, exp: Date.now() + ttlMs };
  const payloadB64 = strToB64url(JSON.stringify(payload));
  const sig = await hmac(payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: string;
  try {
    expected = await hmac(payloadB64);
  } catch {
    return null;
  }
  if (!timingSafeEqualStr(sig, expected)) return null;
  try {
    const payload = JSON.parse(b64urlToStr(payloadB64)) as Payload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    if (payload.who !== "tyler" && payload.who !== "charity" && payload.who !== "mom") return null;
    const household: Household = payload.hh === "mom" ? "mom" : "leber";
    return { who: payload.who, household };
  } catch {
    return null;
  }
}

// Which session does this password grant, if any?
export function passwordMatch(password: string): Session | null {
  for (const c of credentials()) {
    if (timingSafeEqualStr(password, c.password)) return c.session;
  }
  return null;
}
