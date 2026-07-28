import { NextResponse } from "next/server";
import { normalizeSupabaseUrl } from "@/lib/supabase";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Expone URL + anon key (son públicas por diseño) para que el browser
 * pueda iniciar el magic link con PKCE y guardar el code_verifier.
 */
export async function GET() {
  const rawUrl = env("NEXT_PUBLIC_SUPABASE_URL");
  const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!rawUrl || !anon) {
    return NextResponse.json(
      {
        error:
          "Faltan next_public_supabase_url o next_public_supabase_anon_key",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    url: normalizeSupabaseUrl(rawUrl),
    anonKey: anon,
  });
}
