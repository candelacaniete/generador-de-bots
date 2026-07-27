import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { BOOKING_TOOLS, runBookingTool } from "@/lib/booking-tools";

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
AGENDA HABILITADA. Usá tools para turnos.

REGLAS DURAS (no las rompas):
1) Para listar qué se puede reservar: SIEMPRE listar_servicios. NO armes la lista desde el PDF.
2) Nunca inventes horarios: SIEMPRE consultar_disponibilidad.
3) Ofrecé los slots que devolvió la tool (idealmente de distintos días). Mostrá fecha+hora.
4) NUNCA digas que el turno quedó reservado/confirmado/pendiente/agendado si crear_turno no devolvió {"ok":true}.
5) Cuando tengas servicio + horario elegido + nombre + teléfono, DEBES llamar crear_turno (con fecha_hora = start ISO del slot, o slot_index).
6) Si crear_turno falla, pedí disculpas y NO inventes un turno.
7) Teléfono obligatorio; email opcional.
8) Si menciona obra social o el servicio tiene requiere_derivacion_humana=true: NO ofrezcas horarios; pedí datos y derivar_a_humano.
9) ${
        requiereSeña
          ? "Después de crear_turno ok, llamá obtener_info_sena y pasá alias/CBU + instrucciones. El turno queda PENDIENTE hasta que el negocio confirme el pago."
          : "Después de crear_turno ok, aclará que está PENDIENTE y que el negocio confirmará."
      }
10) Estado actual del flujo de reserva (JSON): ${draft}
`
    : `
AGENDA NO HABILITADA. No ofrezcas reservar turnos ni inventes disponibilidad.
Si piden turno, pedí teléfono y usá derivar_a_humano.
`;

  const system = `Sos el asistente virtual de "${businessName}". Respondé en español, claro y amable.
Usá SOLO el contexto documental para FAQ/precios/info. No inventes datos.
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

  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Claude no devolvió texto");
  }

  return text;
}
