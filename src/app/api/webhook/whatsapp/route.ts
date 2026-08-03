import { after, NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { generateBusinessChatReply } from "@/lib/chat-reply";
import {
  extractIncomingTextMessage,
  findWhatsAppConnection,
  getOrCreateWhatsAppConversation,
  sendWhatsAppMessage,
  type WhatsAppWebhookBody,
} from "@/lib/whatsapp";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Verificación del webhook (Meta → GET con hub.challenge).
 * Configurar en Meta Developer → WhatsApp → Configuration → Callback URL:
 *   https://<tu-dominio>/api/webhook/whatsapp
 * Verify token = WHATSAPP_VERIFY_TOKEN
 */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  const verifyToken = env("WHATSAPP_VERIFY_TOKEN");

  if (mode === "subscribe" && token && verifyToken && token === verifyToken) {
    return new NextResponse(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Mensajes entrantes de WhatsApp Cloud API.
 * Responde 200 al toque (Meta lo exige) y procesa la respuesta del bot en after().
 */
export async function POST(req: NextRequest) {
  let body: WhatsAppWebhookBody;
  try {
    body = (await req.json()) as WhatsAppWebhookBody;
  } catch {
    return NextResponse.json({ status: "ok" });
  }

  const incoming = extractIncomingTextMessage(body);
  if (!incoming) {
    // statuses, reactions, media, etc. — ack silencioso
    return NextResponse.json({ status: "ok" });
  }

  console.log("[whatsapp] mensaje entrante:", {
    from: incoming.from,
    phone_number_id: incoming.phoneNumberId,
    message_id: incoming.messageId,
    text: incoming.text.slice(0, 200),
  });

  after(async () => {
    try {
      await handleIncomingWhatsAppMessage(incoming);
    } catch (err) {
      console.error("[whatsapp] error procesando mensaje:", err);
    }
  });

  return NextResponse.json({ status: "ok" });
}

async function handleIncomingWhatsAppMessage(incoming: {
  from: string;
  text: string;
  phoneNumberId: string;
  messageId: string | null;
}) {
  const connection = await findWhatsAppConnection(incoming.phoneNumberId);
  if (!connection) {
    console.warn(
      "[whatsapp] sin whatsapp_connections para phone_number_id=",
      incoming.phoneNumberId,
      "(¿corriste supabase/schema_whatsapp.sql y cargaste la fila?)"
    );
    return;
  }

  const conversation = await getOrCreateWhatsAppConversation({
    businessId: connection.business_id,
    waFrom: incoming.from,
  });

  const reply = await generateBusinessChatReply({
    businessId: connection.business_id,
    mensaje: incoming.text,
    conversationId: conversation.id,
  });

  const sent = await sendWhatsAppMessage(
    incoming.phoneNumberId,
    incoming.from,
    reply.respuesta,
    connection.access_token
  );

  if (!sent.ok) {
    console.error("[whatsapp] no se pudo enviar respuesta:", sent.error);
  } else {
    console.log("[whatsapp] respuesta enviada:", {
      to: incoming.from,
      wa_message_id: sent.messageId,
      conversation_id: reply.conversation_id,
      booking: reply.booking,
    });
  }
}
