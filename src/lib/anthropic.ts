import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

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

/**
 * FAQ / chat general. La reserva de turnos la maneja booking-orchestrator
 * (no tools): así no se inventan horarios ni confirmaciones.
 */
export async function generateChatReply(params: {
  businessName: string;
  contextChunks: string[];
  mensaje: string;
  history?: ChatMessage[];
  agendaHabilitada?: boolean;
}): Promise<string> {
  const {
    businessName,
    contextChunks,
    mensaje,
    history = [],
    agendaHabilitada = false,
  } = params;

  const client = getAnthropic();

  const context =
    contextChunks.length > 0
      ? contextChunks.map((c, i) => `[${i + 1}]\n${c}`).join("\n\n")
      : "(Sin contexto documental disponible)";

  const agendaHint = agendaHabilitada
    ? `Si el usuario quiere reservar un turno/cita/horario, NO inventes disponibilidad ni confirmes reservas. Decile claramente que escriba "quiero un turno" para iniciar la reserva guiada.`
    : `No hay agenda online. Si piden turno, pedí teléfono y sugerí contactar al negocio.`;

  const system = `Sos el asistente virtual de "${businessName}". Respondé en español, claro y amable.
Usá SOLO el contexto documental para responder FAQ, precios, servicios informativos, etc. No inventes.
${agendaHint}
NUNCA digas que un turno quedó reservado/agendado/confirmado: eso solo lo hace el sistema de agenda.

Contexto documental:
${context}`;

  const messages: Anthropic.Messages.MessageParam[] = [
    ...history
      .filter((m) => m.content?.trim())
      .slice(-16)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    { role: "user", content: mensaje },
  ];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages,
  });

  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) throw new Error("Claude no devolvió texto");
  return text;
}
