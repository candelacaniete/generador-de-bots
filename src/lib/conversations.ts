import { getSupabase } from "@/lib/supabase";
import type { ChatMessage } from "@/lib/anthropic";

export async function getOrCreateConversation(params: {
  businessId: string;
  conversationId?: string | null;
}): Promise<{ id: string; mensajes: ChatMessage[]; estado_flujo: Record<string, unknown> }> {
  const supabase = getSupabase();

  if (params.conversationId) {
    const { data, error } = await supabase
      .from("conversations")
      .select("id, mensajes, estado_flujo")
      .eq("id", params.conversationId)
      .eq("business_id", params.businessId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) {
      return {
        id: data.id,
        mensajes: (data.mensajes as ChatMessage[]) ?? [],
        estado_flujo: (data.estado_flujo as Record<string, unknown>) ?? {},
      };
    }
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      business_id: params.businessId,
      mensajes: [],
      estado_flujo: {},
    })
    .select("id, mensajes, estado_flujo")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo crear la conversación");
  }

  return {
    id: data.id,
    mensajes: [],
    estado_flujo: {},
  };
}

export async function appendConversationMessages(params: {
  conversationId: string;
  businessId: string;
  existing: ChatMessage[];
  userMessage: string;
  assistantMessage: string;
}) {
  const supabase = getSupabase();
  const mensajes: ChatMessage[] = [
    ...params.existing,
    { role: "user" as const, content: params.userMessage },
    { role: "assistant" as const, content: params.assistantMessage },
  ].slice(-40);

  const { error } = await supabase
    .from("conversations")
    .update({
      mensajes,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", params.conversationId)
    .eq("business_id", params.businessId);

  if (error) throw new Error(error.message);
  return mensajes;
}

export async function patchConversationFlow(
  conversationId: string,
  businessId: string,
  patch: Record<string, unknown>
) {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("conversations")
    .select("estado_flujo")
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .maybeSingle();

  const next = {
    ...((data?.estado_flujo as object) || {}),
    ...patch,
  };

  const { error } = await supabase
    .from("conversations")
    .update({
      estado_flujo: next,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("business_id", businessId);

  if (error) throw new Error(error.message);
  return next;
}

export async function getConversationFlow(
  conversationId: string,
  businessId: string
): Promise<Record<string, unknown>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("conversations")
    .select("estado_flujo")
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.estado_flujo as Record<string, unknown>) ?? {};
}
