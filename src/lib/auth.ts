// Household/admin auth. No Supabase Auth, no accounts. See CLAUDE.md > Auth.
//
// A signed, httpOnly cookie carries a role. HOUSEHOLD_PASSWORD grants
// "household"; ADMIN_PASSWORD grants "admin" (which implies household).
// Signing uses Web Crypto (HMAC-SHA256) so the same code runs in both the
// Edge middleware and Node server actions.

export type Role = "household" | "admin";

export const COOKIE_NAME = "mp_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 400; // ~400d (browser cap)

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

// The gate is only active once a signing secret and household password exist.
// Until then the site is open, matching the pre-auth phases and avoiding a
// lockout before env vars are set in Vercel.
export function isAuthConfigured(): boolean {
  return Boolean(env("AUTH_SECRET") && env("HOUSEHOLD_PASSWORD"));
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
type Payload = { role: Role; exp: number };

export async function signSession(role: Role, ttlMs = SESSION_TTL_MS): Promise<string> {
  const payload: Payload = { role, exp: Date.now() + ttlMs };
  const payloadB64 = strToB64url(JSON.stringify(payload));
  const sig = await hmac(payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function verifySession(token: string | undefined | null): Promise<Role | null> {
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
    if (payload.role !== "household" && payload.role !== "admin") return null;
    return payload.role;
  } catch {
    return null;
  }
}

// Validate a submitted password against the configured passwords.
// Returns the role it grants, or null. Admin is checked first.
export function roleForPassword(password: string): Role | null {
  const admin = env("ADMIN_PASSWORD");
  const household = env("HOUSEHOLD_PASSWORD");
  if (admin && timingSafeEqualStr(password, admin)) return "admin";
  if (household && timingSafeEqualStr(password, household)) return "household";
  return null;
}

export function roleAllows(role: Role | null, required: Role): boolean {
  if (role === "admin") return true; // admin implies household
  return role === required;
}
