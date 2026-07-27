import { NextRequest, NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/google-oauth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const businessId = req.nextUrl.searchParams.get("business_id")?.trim();
    if (!businessId) {
      return NextResponse.json(
        { error: "business_id es obligatorio" },
        { status: 400 }
      );
    }

    const url = getGoogleAuthUrl(businessId);
    return NextResponse.redirect(url);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo iniciar OAuth";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
