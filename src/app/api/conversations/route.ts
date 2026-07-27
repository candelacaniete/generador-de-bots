import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: NextRequest) {
  try {
    const businessId = req.nextUrl.searchParams.get("business_id")?.trim();
    const conversationId = req.nextUrl.searchParams
      .get("conversation_id")
      ?.trim();

    if (!businessId || !conversationId) {
      return NextResponse.json(
        { error: "business_id y conversation_id son obligatorios" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("conversations")
      .select("id, mensajes, estado_flujo, creado_en, actualizado_en")
      .eq("id", conversationId)
      .eq("business_id", businessId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: corsHeaders() }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Conversación no encontrada" },
        { status: 404, headers: corsHeaders() }
      );
    }

    return NextResponse.json(
      {
        conversation_id: data.id,
        mensajes: data.mensajes ?? [],
        estado_flujo: data.estado_flujo ?? {},
      },
      { headers: corsHeaders() }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders() }
    );
  }
}
