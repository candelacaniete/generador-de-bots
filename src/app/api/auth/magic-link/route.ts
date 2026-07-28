import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/lib/supabase";
import { env } from "@/lib/env";
import { resolvePublicAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";

/**
 * Magic link vía server: así leemos next_public_supabase_anon_key
 * (minúsculas) sin depender del inline de NEXT_PUBLIC_* en el browser.
 */
export async function POST(req: NextRequest) {
  try {
    const rawUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    if (!rawUrl || !anon) {
      return NextResponse.json(
        {
          error:
            "Faltan next_public_supabase_url o next_public_supabase_anon_key en el entorno",
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const nextPath = String(body.next ?? "/").trim() || "/";

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }

    const appUrl = resolvePublicAppUrl(req);
    const redirectTo = `${appUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`;

    const supabase = createClient(normalizeSupabaseUrl(rawUrl), anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true,
      },
    });

    if (error) {
      const isRateLimit = /rate limit/i.test(error.message);
      return NextResponse.json(
        {
          error: isRateLimit
            ? "Supabase frenó el envío de emails (rate limit). Esperá ~1 hora o configurá SMTP propio (Resend) en Authentication → SMTP."
            : error.message,
          hint: isRateLimit
            ? "Supabase free con mailer default: pocos mails/hora. En Dashboard → Authentication → Emails → SMTP Settings, usá Resend (smtp.resend.com)."
            : "En Supabase → Authentication → URL Configuration: Site URL y Redirect URLs deben ser https://generador-de-bots.vercel.app (no localhost).",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, redirect_to: redirectTo });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "No se pudo enviar el magic link",
      },
      { status: 500 }
    );
  }
}
