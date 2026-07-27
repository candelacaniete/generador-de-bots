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
  } = params;

  const client = getAnthropic();

  const context =
    contextChunks.length > 0
      ? contextChunks.map((c, i) => `[${i + 1}]\n${c}`).join("\n\n")
      : "(Sin contexto documental disponible)";

  const agendaRules = agendaHabilitada
    ? `
AGENDA HABILITADA. Podés reservar turnos usando las tools.
Reglas estrictas:
- Nunca inventes horarios: usá consultar_disponibilidad.
- Ofrecé 3-4 horarios concretos; no preguntes "¿cuándo te viene bien?" en abierto.
- Si no hay slots en 7 días y hay un próximo después, ofrecé solo ese.
- Si no hay nada en la ventana completa, pedí nombre+teléfono y usá derivar_a_humano.
- Teléfono obligatorio; email opcional.
- Si el usuario menciona obra social / autorización, o el servicio tiene requiere_derivacion_humana, NO ofrezcas horarios: pedí datos y derivá.
- Al crear el turno queda PENDIENTE. ${
        requiereSeña
          ? "Después llamá obtener_info_seña y pasá alias/CBU + instrucciones."
          : "Indicá que el negocio lo contactará para confirmar."
      }
- Para FAQ usá el contexto documental; para turnos usá tools.`
    : `
AGENDA NO HABILITADA. No ofrezcas reservar turnos ni inventes disponibilidad.
Si piden turno, pedí teléfono y sugerí que el negocio los contacte (derivar_a_humano si tenés la tool; si no, solo pedí datos).`;

  const system = `Sos el asistente virtual de "${businessName}". Respondé en español, claro y amable.
Usá SOLO la información del contexto documental para datos del negocio (precios, FAQ, etc.). No inventes.
${agendaRules}

Contexto documental:
${context}`;

  type Msg = Anthropic.Messages.MessageParam;
  const messages: Msg[] = [
    ...history
      .filter((m) => m.content?.trim())
      .slice(-12)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    { role: "user", content: mensaje },
  ];

  const tools = agendaHabilitada ? BOOKING_TOOLS : BOOKING_TOOLS.filter(
    (t) => t.name === "derivar_a_humano" || t.name === "obtener_info_seña"
  );

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    tools,
    messages,
  });

  let guard = 0;
  while (response.stop_reason === "tool_use" && guard < 6) {
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
