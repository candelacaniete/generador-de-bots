import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { generateWidgetScript } from "@/lib/widget-script";
import { env } from "@/lib/env";
import { normalizeAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";

function appBaseUrl(req: NextRequest): string {
  const fromEnv = normalizeAppUrl(env("NEXT_PUBLIC_APP_URL"));
  if (fromEnv) return fromEnv;
  return req.nextUrl.origin;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ business_id: string }> }
) {
  try {
    const { business_id } = await context.params;
    const businessId = business_id?.trim();
    const wantsDownload = req.nextUrl.searchParams.get("download") === "1";

    if (!businessId) {
      return NextResponse.json(
        { error: "business_id es obligatorio" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const { data: business, error } = await supabase
      .from("businesses")
      .select("id, nombre, slug")
      .eq("id", businessId)
      .maybeSingle();

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Error al buscar el negocio" },
        { status: 500 }
      );
    }

    if (!business) {
      return NextResponse.json(
        { error: "Negocio no encontrado" },
        { status: 404 }
      );
    }

    const script = generateWidgetScript({
      businessId: business.id,
      apiBaseUrl: appBaseUrl(req),
      businessName: business.nombre,
    });

    const filename = `chatbot-${business.slug}.js`;
    const headers: Record<string, string> = {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    };

    if (wantsDownload) {
      headers["Content-Disposition"] = `attachment; filename="${filename}"`;
    } else {
      // Para <script src="..."> en WordPress u otros sitios
      headers["Content-Disposition"] = `inline; filename="${filename}"`;
    }

    return new NextResponse(script, { status: 200, headers });
  } catch (err) {
    console.error("[widget]", err);
    const message =
      err instanceof Error ? err.message : "Error al generar el script";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
