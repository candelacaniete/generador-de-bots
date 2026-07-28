import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  getGoogleAccountEmail,
} from "@/lib/google-oauth";
import { getSupabase } from "@/lib/supabase";
import { resolvePublicAppUrl } from "@/lib/app-url";
import { DEFAULT_HORARIO } from "@/lib/schedule";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const businessId = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  const appUrl = resolvePublicAppUrl(req);

  if (oauthError || !code || !businessId) {
    return NextResponse.redirect(
      `${appUrl}/panel/${businessId || ""}?tab=config&calendar=error`
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        `${appUrl}/panel/${businessId}?tab=config&calendar=missing_refresh`
      );
    }

    const email = await getGoogleAccountEmail(tokens.refresh_token);
    const supabase = getSupabase();

    const { error } = await supabase.from("business_calendar_config").upsert(
      {
        business_id: businessId,
        google_calendar_id: "primary",
        google_refresh_token: tokens.refresh_token,
        google_account_email: email,
        horario_laboral: DEFAULT_HORARIO,
        conectado_en: new Date().toISOString(),
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: "business_id" }
    );

    if (error) throw new Error(error.message);

    await supabase
      .from("businesses")
      .update({ agenda_habilitada: true })
      .eq("id", businessId);

    return NextResponse.redirect(
      `${appUrl}/panel/${businessId}?tab=config&calendar=connected`
    );
  } catch (err) {
    console.error("[oauth/callback]", err);
    return NextResponse.redirect(
      `${appUrl}/panel/${businessId}?tab=config&calendar=error`
    );
  }
}
