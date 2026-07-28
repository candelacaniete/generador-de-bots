import { createBrowserClient } from "@supabase/ssr";
import { normalizeSupabaseUrl } from "@/lib/supabase";
import { env } from "@/lib/env";

export function createBrowserSupabase() {
  const rawUrl = env("NEXT_PUBLIC_SUPABASE_URL");
  const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!rawUrl || !anon) {
    throw new Error(
      "Faltan next_public_supabase_url o next_public_supabase_anon_key en el entorno"
    );
  }
  return createBrowserClient(normalizeSupabaseUrl(rawUrl), anon);
}
