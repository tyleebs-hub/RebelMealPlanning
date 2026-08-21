import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Read-only public client for server components (phase 1, no auth yet).
// Returns null when env vars are missing so pages can render a setup notice
// instead of crashing before the Supabase project is provisioned.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

export function getSupabase(): SupabaseClient | null {
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
