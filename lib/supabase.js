import { createClient } from "@supabase/supabase-js";

// Placeholders allow `next build` without .env; replace at runtime via env
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** False when using build-time placeholders (e.g. Vercel env not set). */
export function isSupabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url.trim() || url.includes("placeholder.supabase.co")) return false;
  if (!key.trim() || key === "placeholder-anon-key") return false;
  return true;
}
