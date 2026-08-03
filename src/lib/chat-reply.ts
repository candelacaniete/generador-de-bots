import { generateChatReply } from "@/lib/anthropic";
import { handleBookingOrchestrator } from "@/lib/booking-orchestrator";
import { embedText } from "@/lib/embeddings";
import { getSupabase, type MatchedChunk } from "@/lib/supabase";
import { env } from "@/lib/env";
import {
  appendConversationMessages,
  getOrCreateConversation,
} from "@/lib/conversations";

export type BusinessChatReplyInput = {
  businessId: string;
  mensaje: string;
  conversationId?: string | null;
};

export type BusinessChatReplyResult = {
  respuesta: string;
  conversation_id: string;
  booking: boolean;
  fuentes: Array<{ id: string; similarity: number }>;
};

export function missingChatEnv(): string | null {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
  ] as const;
  const missing = required.filter((key) => !env(key));
  if (missing.length === 0) return null;
  return `Faltan variables de entorno: ${missing
    .map((k) => k.toLowerCase())
    .join(", ")}`;
}

/**
 * Misma lógica que el widget web (/api/chat): booking orchestrator + RAG + Claude.
 * Reutilizable desde WhatsApp u otros canales.
 */
export async function generateBusinessChatReply(
  params: BusinessChatReplyInput
): Promise<BusinessChatReplyResult> {
  const businessId = params.businessId.trim();
  const mensaje = params.mensaje.trim();
  const incomingConversationId = params.conversationId
    ? String(params.conversationId).trim()
    : null;

  if (!businessId) throw new Error("business_id es obligatorio");
  if (!mensaje) throw new Error("mensaje es obligatorio");

  const envError = missingChatEnv();
  if (envError) throw new Error(envError);

  const supabase = getSupabase();

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, nombre, agenda_habilitada, requiere_sena")
    .eq("id", businessId)
    .maybeSingle();

  if (businessError) {
    throw new Error(`Error al buscar el negocio: ${businessError.message}`);
  }
  if (!business) {
    throw new Error("Negocio no encontrado");
  }

  const conversation = await getOrCreateConversation({
    businessId,
    conversationId: incomingConversationId,
  });

  if (business.agenda_habilitada) {
    const booking = await handleBookingOrchestrator({
      businessId,
      conversationId: conversation.id,
      mensaje,
      requiereSena: Boolean(business.requiere_sena),
    });

    if (booking.handled && booking.respuesta) {
      await appendConversationMessages({
        conversationId: conversation.id,
        businessId,
        existing: conversation.mensajes,
        userMessage: mensaje,
        assistantMessage: booking.respuesta,
      });

      return {
        respuesta: booking.respuesta,
        conversation_id: conversation.id,
        booking: true,
        fuentes: [],
      };
    }
  }

  const queryEmbedding = await embedText(mensaje);
  const { data: matches, error: matchError } = await supabase.rpc(
    "match_document_chunks",
    {
      query_embedding: `[${queryEmbedding.join(",")}]`,
      match_business_id: businessId,
      match_count: 5,
    }
  );

  if (matchError) {
    throw new Error(`Error en la búsqueda semántica: ${matchError.message}`);
  }

  const chunks = (matches as MatchedChunk[] | null) ?? [];
  const contextChunks = chunks.map((c) => c.contenido);

  const respuesta = await generateChatReply({
    businessName: business.nombre,
    contextChunks,
    mensaje,
    history: conversation.mensajes,
    agendaHabilitada: Boolean(business.agenda_habilitada),
  });

  await appendConversationMessages({
    conversationId: conversation.id,
    businessId,
    existing: conversation.mensajes,
    userMessage: mensaje,
    assistantMessage: respuesta,
  });

  return {
    respuesta,
    conversation_id: conversation.id,
    booking: false,
    fuentes: chunks.map((c) => ({
      id: c.id,
      similarity: c.similarity,
    })),
  };
}
