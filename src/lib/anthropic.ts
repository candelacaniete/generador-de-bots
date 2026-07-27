import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import {
  BOOKING_TOOLS,
  maybeAutoCreateBooking,
  runBookingTool,
} from "@/lib/booking-tools";

const MODEL = "claude-haiku-4-5-20251001";

let anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (anthropic) return anthropic;
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("Falta ANTHROPIC_API_KEY en el entorno");
  }
  anthropic = new Anthropic({ apiKey });
  return anthropic;
}

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function generateChatReply(params: {
  businessName: string;
  contextChunks: string[];
  mensaje: string;
  history?: ChatMessage[];
  agendaHabilitada?: boolean;
  requiereSeña?: boolean;
  businessId: string;
  conversationId: string | null;
  estadoFlujo?: Record<string, unknown>;
}): Promise<string> {
  const {
    businessName,
    contextChunks,
    mensaje,
    history = [],
    agendaHabilitada = false,
    requiereSeña = false,
    businessId,
    conversationId,
    estadoFlujo = {},
  } = params;

  const client = getAnthropic();

  const context =
    contextChunks.length > 0
      ? contextChunks.map((c, i) => `[${i + 1}]\n${c}`).join("\n\n")
      : "(Sin contexto documental disponible)";

  const draft = JSON.stringify(estadoFlujo ?? {});

  const agendaRules = agendaHabilitada
    ? `
AGENDA HABILITADA. Flujo OBLIGATORIO de reserva (en este orden):
1) listar_servicios (si hay >1, preguntá cuál; si hay 1, seguí)
2) consultar_dias_disponibles → ofrecé DÍAS (no horarios todavía). NO pidas nombre/teléfono.
3) Usuario elige día → consultar_horarios_dia(fecha, offset=0, limit=5) → ofrecé hasta 5 horarios.
4) Si pide más horarios → consultar_horarios_dia con offset+=5 del mismo día.
5) Usuario elige un horario → seleccionar_slot(slot_index) 
6) Recién ahí pedí nombre + teléfono (email opcional)
7) crear_turno(nombre, telefono, email?) — SIN esto NO digas que quedó reservado
8) ${
        requiereSeña
          ? "obtener_info_sena y pasá alias/CBU + instrucciones (turno queda pendiente)"
          : "Aclará que quedó PENDIENTE y el negocio confirmará"
      }

PROHIBIDO:
- Pedir nombre/teléfono antes de elegir día y horario
- Inventar días/horarios (siempre tools)
- Decir "reservado/agendado/registrado" sin crear_turno ok:true
- Usar el PDF como lista de servicios reservables

Estado del flujo: ${draft}
`
    : `
AGENDA NO HABILITADA. No ofrezcas turnos. Si piden turno, pedí teléfono y derivar_a_humano.
`;

  const system = `Sos el asistente virtual de "${businessName}". Español, claro y amable.
FAQ/precios: solo del contexto documental. Turnos: solo tools.
${agendaRules}

Contexto documental:
${context}`;

  type Msg = Anthropic.Messages.MessageParam;
  const messages: Msg[] = [
    ...history
      .filter((m) => m.content?.trim())
      .slice(-16)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    { role: "user", content: mensaje },
  ];

  const tools = agendaHabilitada
    ? BOOKING_TOOLS
    : BOOKING_TOOLS.filter(
        (t) => t.name === "derivar_a_humano" || t.name === "obtener_info_sena"
      );

  let createdBookingThisTurn = false;

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    tools,
    messages,
  });

  let guard = 0;
  while (response.stop_reason === "tool_use" && guard < 8) {
    guard += 1;
    const toolUses = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
    );

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const tool of toolUses) {
      const result = await runBookingTool(
        tool.name,
        tool.input as Record<string, unknown>,
        { businessId, conversationId }
      );
      if (tool.name === "crear_turno") {
        try {
          const parsed = JSON.parse(result) as { ok?: boolean };
          if (parsed.ok) createdBookingThisTurn = true;
        } catch {
          /* ignore */
        }
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: tool.id,
        content: result,
      });
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools,
      messages,
    });
  }

  // Safety net: slot elegido + teléfono en el mensaje → crear turno sí o sí
  if (agendaHabilitada && !createdBookingThisTurn) {
    const auto = await maybeAutoCreateBooking({
      businessId,
      conversationId,
      userMessage: mensaje,
      requiereSena: requiereSeña,
    });
    if (auto.created && auto.summary) {
      return auto.summary;
    }
  }

  let text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Claude no devolvió texto");
  }

  // Si el modelo afirma reserva sin tool ok, corregir
  if (
    agendaHabilitada &&
    !createdBookingThisTurn &&
    /(reservad|agendad|registrad|confirmad).{0,40}(turno|cita)/i.test(text)
  ) {
    text +=
      "\n\n(Nota: todavía no pude confirmar el bloqueo en la agenda. ¿Me repetís nombre y teléfono para reintentar?)";
  }

  return text;
}
