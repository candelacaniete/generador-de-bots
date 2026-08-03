import { getSupabase } from "@/lib/supabase";
import {
  getOrCreateConversation,
  patchConversationFlow,
} from "@/lib/conversations";
import type { ChatMessage } from "@/lib/anthropic";
import { env } from "@/lib/env";

const GRAPH_API_VERSION = env("WHATSAPP_API_VERSION") ?? "v21.0";

/* ── Tipos del webhook de Meta (Cloud API) ── */

export type WhatsAppTextBody = {
  body?: string;
};

export type WhatsAppIncomingMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: WhatsAppTextBody;
};

export type WhatsAppMetadata = {
  display_phone_number?: string;
  phone_number_id?: string;
};

export type WhatsAppValue = {
  messaging_product?: string;
  metadata?: WhatsAppMetadata;
  contacts?: Array<{
    profile?: { name?: string };
    wa_id?: string;
  }>;
  messages?: WhatsAppIncomingMessage[];
  statuses?: unknown[];
};

export type WhatsAppChange = {
  value?: WhatsAppValue;
  field?: string;
};

export type WhatsAppEntry = {
  id?: string;
  changes?: WhatsAppChange[];
};

export type WhatsAppWebhookBody = {
  object?: string;
  entry?: WhatsAppEntry[];
};

export type IncomingWhatsAppText = {
  from: string;
  text: string;
  messageId: string | null;
  phoneNumberId: string;
};

/**
 * Extrae el primer mensaje de texto entrante del payload de Meta.
 * Devuelve null si el evento no es un mensaje de texto (statuses, etc.).
 */
export function extractIncomingTextMessage(
  body: WhatsAppWebhookBody
): IncomingWhatsAppText | null {
  const value = body.entry?.[0]?.changes?.[0]?.value;
  if (!value) return null;

  const phoneNumberId = value.metadata?.phone_number_id?.trim();
  const message = value.messages?.[0];
  if (!phoneNumberId || !message) return null;

  if (message.type !== "text") return null;

  const from = message.from?.trim();
  const text = message.text?.body?.trim();
  if (!from || !text) return null;

  return {
    from,
    text,
    messageId: message.id?.trim() || null,
    phoneNumberId,
  };
}

export type WhatsAppConnection = {
  id: string;
  phone_number_id: string;
  business_id: string;
  access_token: string;
};

/**
 * Busca el negocio asociado a un phone_number_id de WhatsApp.
 *
 * TODO: crear la tabla en Supabase (ver supabase/schema_whatsapp.sql):
 *
 *   create table whatsapp_connections (
 *     id uuid primary key default gen_random_uuid(),
 *     phone_number_id text not null unique,
 *     business_id uuid not null references businesses(id) on delete cascade,
 *     access_token text not null,
 *     created_at timestamptz not null default now()
 *   );
 */
export async function findWhatsAppConnection(
  phoneNumberId: string
): Promise<WhatsAppConnection | null> {
  const supabase = getSupabase();

  // Query de ejemplo — falla hasta que exista la tabla.
  const { data, error } = await supabase
    .from("whatsapp_connections")
    .select("id, phone_number_id, business_id, access_token")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();

  if (error) {
    console.error("[whatsapp] findWhatsAppConnection:", error.message);
    return null;
  }
  if (!data?.business_id || !data?.access_token) return null;

  return {
    id: data.id,
    phone_number_id: data.phone_number_id,
    business_id: data.business_id,
    access_token: data.access_token,
  };
}

/**
 * Reusa o crea una conversación por (negocio + número WA) vía estado_flujo,
 * para mantener historial / flujo de turnos entre mensajes.
 */
export async function getOrCreateWhatsAppConversation(params: {
  businessId: string;
  waFrom: string;
}): Promise<{
  id: string;
  mensajes: ChatMessage[];
  estado_flujo: Record<string, unknown>;
}> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, mensajes, estado_flujo")
    .eq("business_id", params.businessId)
    .contains("estado_flujo", {
      canal: "whatsapp",
      wa_from: params.waFrom,
    })
    .order("actualizado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[whatsapp] lookup conversation:", error.message);
  }

  if (data) {
    return {
      id: data.id,
      mensajes: (data.mensajes as ChatMessage[]) ?? [],
      estado_flujo: (data.estado_flujo as Record<string, unknown>) ?? {},
    };
  }

  const created = await getOrCreateConversation({
    businessId: params.businessId,
  });

  await patchConversationFlow(created.id, params.businessId, {
    canal: "whatsapp",
    wa_from: params.waFrom,
  });

  return created;
}

export type SendWhatsAppMessageResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

/**
 * Envía un mensaje de texto simple por WhatsApp Cloud API.
 */
export async function sendWhatsAppMessage(
  phoneNumberId: string,
  to: string,
  text: string,
  accessToken: string
): Promise<SendWhatsAppMessageResult> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(
    phoneNumberId
  )}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: {
      preview_url: false,
      body: text,
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; code?: number; type?: string };
    };

    if (!res.ok) {
      const msg =
        data.error?.message ||
        `WhatsApp API error HTTP ${res.status}`;
      console.error("[whatsapp] sendWhatsAppMessage failed:", {
        status: res.status,
        error: data.error,
        phoneNumberId,
        to,
      });
      return { ok: false, error: msg };
    }

    return {
      ok: true,
      messageId: data.messages?.[0]?.id,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error de red";
    console.error("[whatsapp] sendWhatsAppMessage exception:", err);
    return { ok: false, error: msg };
  }
}
