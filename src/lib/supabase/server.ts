import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { normalizeSupabaseUrl } from "@/lib/supabase";
import { env } from "@/lib/env";

export async function createServerSupabase() {
  const rawUrl = env("NEXT_PUBLIC_SUPABASE_URL");
  const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!rawUrl || !anon) {
    throw new Error(
      "Faltan next_public_supabase_url o next_public_supabase_anon_key en el entorno"
    );
  }

  const cookieStore = await cookies();
  const url = normalizeSupabaseUrl(rawUrl);

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          /* Server Component — middleware refreshes session */
        }
      },
    },
  });
}
