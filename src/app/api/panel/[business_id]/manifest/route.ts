import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { normalizeAppUrl } from "@/lib/app-url";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ business_id: string }> }
) {
  const { business_id } = await context.params;
  const appUrl =
    normalizeAppUrl(env("NEXT_PUBLIC_APP_URL")) ?? "https://generador-de-bots.vercel.app";

  let nombre = "Negocio";
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("businesses")
      .select("nombre")
      .eq("id", business_id)
      .maybeSingle();
    if (data?.nombre) nombre = data.nombre;
  } catch {
    /* ignore */
  }

  const manifest = {
    name: `Turnos · ${nombre}`,
    short_name: "Turnos",
    description: `Panel de turnos de ${nombre}`,
    start_url: `/panel/${business_id}`,
    scope: `/panel/${business_id}`,
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    lang: "es",
    icons: [
      {
        src: `${appUrl}/icons/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: `${appUrl}/icons/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
