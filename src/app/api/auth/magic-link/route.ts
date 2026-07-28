import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { resolvePublicAppUrl } from "@/lib/app-url";
import { sendMagicLinkEmail } from "@/lib/email";
import { isAdminEmail } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Magic link 100% server-side:
 * - generateLink con service_role (nunca manda secret al browser)
 * - email vía Resend con link a /auth/callback?token_hash=...
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

    // magiclink (usuario existente) o invite (alta)
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
      return NextResponse.json(
        {
          error:
            generated.error?.message ||
            "No se pudo generar el link de acceso",
        },
        { status: 400 }
      );
    }

    const props = generated.data.properties as {
      hashed_token?: string;
      verification_type?: string;
      action_link?: string;
    };

    const tokenHash = props.hashed_token;
    const verifyType = props.verification_type || "email";

    if (!tokenHash) {
      // Fallback al action_link de Supabase (pasa por su verify)
      const action = props.action_link;
      if (!action) {
        return NextResponse.json(
          { error: "Supabase no devolvió token ni action_link" },
          { status: 500 }
        );
      }
      const sent = await sendMagicLinkEmail({ to: email, loginUrl: action });
      if (!sent.ok) {
        return NextResponse.json({ error: sent.error }, { status: 500 });
      }
      return NextResponse.json({
        ok: true,
        via: "action_link",
        is_admin: isAdminEmail(email),
      });
    }

    const loginUrl =
      `${appUrl}/auth/callback` +
      `?token_hash=${encodeURIComponent(tokenHash)}` +
      `&type=${encodeURIComponent(verifyType)}` +
      `&next=${encodeURIComponent(nextPath)}`;

    const sent = await sendMagicLinkEmail({ to: email, loginUrl });
    if (!sent.ok) {
      return NextResponse.json({ error: sent.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      via: "token_hash",
      is_admin: isAdminEmail(email),
    });
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
