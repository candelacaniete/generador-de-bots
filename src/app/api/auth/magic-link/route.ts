import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabase, normalizeSupabaseUrl } from "@/lib/supabase";
import { resolvePublicAppUrl } from "@/lib/app-url";
import { sendMagicLinkEmail } from "@/lib/email";
import { isAdminEmail } from "@/lib/auth";
import { env } from "@/lib/env";

export const runtime = "nodejs";

function isResendTestRestriction(message: string): boolean {
  return /testing emails|verify a domain|only send testing/i.test(message);
}

async function sendViaSupabaseAuthEmail(
  email: string,
  redirectTo: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rawUrl = env("NEXT_PUBLIC_SUPABASE_URL");
  const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  // Preferir anon real; si pegaron service_role en anon_key, igual sirve en server
  const key = anon || env("SUPABASE_SERVICE_ROLE_KEY");
  if (!rawUrl || !key) {
    return {
      ok: false,
      error: "Faltan credenciales de Supabase para el fallback de email",
    };
  }

  const supabase = createClient(normalizeSupabaseUrl(rawUrl), key, {
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
    if (/rate limit/i.test(error.message)) {
      return {
        ok: false,
        error:
          "Supabase también frenó el envío (rate limit). Esperá un rato o verificá un dominio en Resend.",
      };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

/**
 * Magic link server-side:
 * 1) generateLink + Resend (ideal)
 * 2) si Resend está en modo test / sin dominio → fallback al mail de Supabase Auth
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const nextPath = String(body.next ?? "/").trim() || "/";

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }

    const appUrl = resolvePublicAppUrl(req);
    const redirectTo = `${appUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const supabase = getSupabase();

    let generated = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    if (generated.error) {
      const msg = generated.error.message || "";
      if (/not found|no.*user|user.*not/i.test(msg)) {
        generated = await supabase.auth.admin.generateLink({
          type: "invite",
          email,
          options: { redirectTo },
        });
      }
    }

    if (generated.error || !generated.data) {
      // Sin generateLink: aún podemos mandar OTP nativo de Supabase
      const native = await sendViaSupabaseAuthEmail(email, redirectTo);
      if (!native.ok) {
        return NextResponse.json(
          {
            error:
              generated.error?.message ||
              native.error ||
              "No se pudo generar el link de acceso",
          },
          { status: 400 }
        );
      }
      return NextResponse.json({
        ok: true,
        via: "supabase_email",
        is_admin: isAdminEmail(email),
        notice:
          "Te mandamos el link con el mailer de Supabase (no Resend).",
      });
    }

    const props = generated.data.properties as {
      hashed_token?: string;
      verification_type?: string;
      action_link?: string;
    };

    const tokenHash = props.hashed_token;
    const verifyType = props.verification_type || "email";
    const loginUrl = tokenHash
      ? `${appUrl}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(verifyType)}&next=${encodeURIComponent(nextPath)}`
      : props.action_link;

    if (!loginUrl) {
      return NextResponse.json(
        { error: "Supabase no devolvió un link usable" },
        { status: 500 }
      );
    }

    const sent = await sendMagicLinkEmail({ to: email, loginUrl });

    if (sent.ok) {
      return NextResponse.json({
        ok: true,
        via: "resend",
        is_admin: isAdminEmail(email),
      });
    }

    // Resend en modo test solo manda al mail de la cuenta Resend
    if (isResendTestRestriction(sent.error)) {
      const native = await sendViaSupabaseAuthEmail(email, redirectTo);
      if (native.ok) {
        return NextResponse.json({
          ok: true,
          via: "supabase_email_fallback",
          is_admin: isAdminEmail(email),
          notice:
            "Resend está en modo test (solo manda a mailpruebascandela@gmail.com). Usamos el mail de Supabase para este envío. Para producción: verificá un dominio en resend.com/domains y poné ese from en resend_from.",
        });
      }

      return NextResponse.json(
        {
          error:
            `Resend solo puede mandar a tu mail de prueba (mailpruebascandela@gmail.com) hasta que verifiques un dominio. ` +
            `Opciones: 1) ingresá con mailpruebascandela@gmail.com, 2) verificá dominio en Resend, 3) fallback Supabase falló: ${native.error}`,
        },
        { status: 400 }
      );
    }

    // Otro error de Resend → intentar Supabase igual
    const native = await sendViaSupabaseAuthEmail(email, redirectTo);
    if (native.ok) {
      return NextResponse.json({
        ok: true,
        via: "supabase_email_fallback",
        is_admin: isAdminEmail(email),
        notice: `Resend falló (${sent.error}). Enviamos por Supabase.`,
      });
    }

    return NextResponse.json(
      { error: `${sent.error} / fallback: ${native.error}` },
      { status: 500 }
    );
  } catch (err) {
    console.error("[magic-link]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "No se pudo enviar el magic link",
      },
      { status: 500 }
    );
  }
}
