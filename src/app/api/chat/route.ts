import { NextRequest, NextResponse } from "next/server";
import {
  generateBusinessChatReply,
  missingChatEnv,
} from "@/lib/chat-reply";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatBody = {
  business_id?: string;
  mensaje?: string;
  conversation_id?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const envError = missingChatEnv();
    if (envError) {
      return NextResponse.json(
        { error: envError },
        { status: 500, headers: corsHeaders() }
      );
    }

    const body = (await req.json()) as ChatBody;
    const businessId = String(body.business_id ?? "").trim();
    const mensaje = String(body.mensaje ?? "").trim();
    const incomingConversationId = body.conversation_id
      ? String(body.conversation_id).trim()
      : null;

    if (!businessId) {
      return NextResponse.json(
        { error: "business_id es obligatorio" },
        { status: 400, headers: corsHeaders() }
      );
    }

    if (!mensaje) {
      return NextResponse.json(
        { error: "mensaje es obligatorio" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const result = await generateBusinessChatReply({
      businessId,
      mensaje,
      conversationId: incomingConversationId,
    });

    return NextResponse.json(
      {
        respuesta: result.respuesta,
        conversation_id: result.conversation_id,
        fuentes: result.fuentes,
        ...(result.booking ? { booking: true } : {}),
      },
      { headers: corsHeaders() }
    );
  } catch (err) {
    console.error("[chat]", err);
    const message =
      err instanceof Error ? err.message : "Error interno del chat";

    let status = 500;
    if (message === "Negocio no encontrado") status = 404;
    if (
      message === "business_id es obligatorio" ||
      message === "mensaje es obligatorio"
    ) {
      status = 400;
    }

    return NextResponse.json(
      { error: message },
      { status, headers: corsHeaders() }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
