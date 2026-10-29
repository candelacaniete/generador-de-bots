import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { intakeTurnHint, limitToOneQuestion } from "@/lib/single-question";

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

  const system = `Sos el asistente virtual de "${businessName}". Respondé en español, con voseo, claro y breve.
Usá SOLO el contexto documental para datos del negocio (FAQ, precios, servicios, políticas). No inventes esos datos.
${agendaHint}
NUNCA digas que un turno quedó reservado/agendado/confirmado: eso solo lo hace el sistema de agenda.

Si la consulta se cierra con un dato del contexto (precio, horario, dirección, un sí o un no), respondé ese dato. No abras una entrevista.

Si es un caso a diagnosticar (reclamo, situación personal, o algo que el contexto deriva al equipo humano y no se cierra con un dato):
- Diagnóstico de a UNA pregunta por mensaje. Nunca dos, ni una lista, ni "un par de cosas".
- Cada mensaje tiene como máximo un signo de pregunta. La pregunta va al final.
- No repitas una pregunta que ya esté en el historial. Cuando la persona responde, avanzá a la siguiente que siga abierta.
- Si el contexto trae un cuestionario, seguilo en ese orden, de a una. No agregues preguntas que el contexto no pida. Si no hay cuestionario, hacé solo las mínimas para entender el caso y derivar.
- No calcules montos, indemnizaciones, plazos ni consecuencias. Si preguntan cuánto les corresponde, una oración (lo define el equipo) y después la única pregunta. Esa oración va antes de la pregunta.
- No pidas nombre, teléfono ni email mientras queden preguntas de diagnóstico.
- No ofrezcas la derivación en el mismo mensaje que una pregunta de diagnóstico.
- Cuando ya alcanza para que una persona evalúe el caso, derivá al equipo humano y pedí solo el nombre. En el mensaje siguiente, solo el teléfono. Nunca los dos juntos.
- No vuelvas a saludar si el historial ya tiene mensajes.
- Forma de un mensaje de diagnóstico: una oración corta, sin pregunta, y debajo una sola pregunta.

${intakeTurnHint(history)}

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
  return limitToOneQuestion(text);
}
