import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only client using the secret key. Bypasses RLS, so it must NEVER be
// imported into client components. Used by server actions that write (week
// planning, cook events, slots). Requires SUPABASE_SECRET_KEY in the env.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

export function getSupabaseAdmin(): SupabaseClient {
  if (!url || !secret) {
    throw new Error(
      "SUPABASE_SECRET_KEY (and NEXT_PUBLIC_SUPABASE_URL) must be set for write operations.",
    );
  }
  return createClient(url, secret, { auth: { persistSession: false } });
}

export const isAdminDbConfigured = Boolean(url && process.env.SUPABASE_SECRET_KEY);
