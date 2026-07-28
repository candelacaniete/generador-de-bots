import { NextResponse } from "next/server";
import { normalizeSupabaseUrl } from "@/lib/supabase";
import { env } from "@/lib/env";

export const runtime = "nodejs";

function isSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  if (!key.startsWith("eyJ")) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(key.split(".")[1] || "", "base64url").toString("utf8")
    ) as { role?: string };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

/**
 * Solo la anon/publishable key. Si en Vercel pegaron la service_role
 * en next_public_supabase_anon_key, devolvemos error claro.
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

  if (isSecretKey(anon)) {
    return NextResponse.json(
      {
        error:
          "next_public_supabase_anon_key tiene la service_role (secreta). En Supabase → Settings → API pegá la clave anon / publishable, no la secret.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    url: normalizeSupabaseUrl(rawUrl),
    anonKey: anon,
  });
}
