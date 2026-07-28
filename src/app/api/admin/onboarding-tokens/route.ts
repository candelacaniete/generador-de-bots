import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/auth";
import { env } from "@/lib/env";
import { normalizeAppUrl } from "@/lib/app-url";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const access = await requireAdminApiAccess(req);
  if (!access.ok) return access.response;

  try {
    const body = await req.json().catch(() => ({}));
    const nota = body.nota ? String(body.nota).trim() : null;
    const days = Math.min(90, Math.max(1, Number(body.days) || 14));
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("onboarding_tokens")
      .insert({
        token,
        expires_at: expiresAt.toISOString(),
        nota,
      })
      .select("token, expires_at")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "No se pudo crear el token" },
        { status: 500 }
      );
    }

    const appUrl =
      normalizeAppUrl(env("NEXT_PUBLIC_APP_URL")) || req.nextUrl.origin;
    const url = `${appUrl}/onboarding/${data.token}`;

    return NextResponse.json({
      token: data.token,
      expires_at: data.expires_at,
      url,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
