// Household auth. One shared password to get in; after that, full access to the
// whole app — there is no admin tier. The cookie carries an identity (tyler or
// charity) only so votes can be attributed. Charity arrives via a signed
// /vote/<token> link and never types a password. See CLAUDE.md > Auth.
//
// Signing uses Web Crypto (HMAC-SHA256) so the same code runs in both the Edge
// middleware and Node server actions.

export type Who = "tyler" | "charity";

export const COOKIE_NAME = "mp_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 400; // ~400d (browser cap)

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

// The password may live in either var (both exist in the current deployment).
function passwords(): string[] {
  return [env("HOUSEHOLD_PASSWORD"), env("ADMIN_PASSWORD")].filter(
    (p): p is string => Boolean(p),
  );
}

// The gate is only active once a signing secret and a password exist. Until
// then the site is open, avoiding a lockout before env vars are set.
export function isAuthConfigured(): boolean {
  return Boolean(env("AUTH_SECRET") && passwords().length > 0);
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
type Payload = { who: Who; exp: number };

export async function signSession(who: Who, ttlMs = SESSION_TTL_MS): Promise<string> {
  const payload: Payload = { who, exp: Date.now() + ttlMs };
  const payloadB64 = strToB64url(JSON.stringify(payload));
  const sig = await hmac(payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function verifySession(token: string | undefined | null): Promise<Who | null> {
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
    if (payload.who !== "tyler" && payload.who !== "charity") return null;
    return payload.who;
  } catch {
    return null;
  }
}

// Does the submitted password match the household password?
export function passwordOk(password: string): boolean {
  return passwords().some((p) => timingSafeEqualStr(password, p));
}
