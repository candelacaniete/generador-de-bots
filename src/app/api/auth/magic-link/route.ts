import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabase, normalizeSupabaseUrl } from "@/lib/supabase";
import { resolvePublicAppUrl } from "@/lib/app-url";
import { sendMagicLinkEmail } from "@/lib/email";
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
  const key = anon || env("SUPABASE_SERVICE_ROLE_KEY");
  if (!rawUrl || !key) {
    return { ok: false, error: "send_failed" };
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
    console.error("[magic-link supabase otp]", error.message);
    return { ok: false, error: "send_failed" };
  }

  return { ok: true };
}

/**
 * Magic link server-side. Respuestas al cliente sin fugas técnicas.
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
      const native = await sendViaSupabaseAuthEmail(email, redirectTo);
      if (!native.ok) {
        console.error("[magic-link]", generated.error?.message, native.error);
        return NextResponse.json(
          { error: "No se pudo enviar el link. Probá de nuevo en unos minutos." },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true });
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
        { error: "No se pudo enviar el link. Probá de nuevo en unos minutos." },
        { status: 500 }
      );
    }

    const sent = await sendMagicLinkEmail({ to: email, loginUrl });

    if (sent.ok) {
      return NextResponse.json({ ok: true });
    }

    console.error("[magic-link resend]", sent.error);

    if (isResendTestRestriction(sent.error)) {
      const native = await sendViaSupabaseAuthEmail(email, redirectTo);
      if (native.ok) return NextResponse.json({ ok: true });
      return NextResponse.json(
        { error: "No se pudo enviar el link. Probá de nuevo en unos minutos." },
        { status: 400 }
      );
    }

    const native = await sendViaSupabaseAuthEmail(email, redirectTo);
    if (native.ok) return NextResponse.json({ ok: true });

    return NextResponse.json(
      { error: "No se pudo enviar el link. Probá de nuevo en unos minutos." },
      { status: 500 }
    );
  } catch (err) {
    console.error("[magic-link]", err);
    return NextResponse.json(
      { error: "No se pudo enviar el link. Probá de nuevo en unos minutos." },
      { status: 500 }
    );
  }
}
