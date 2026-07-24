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

export async function generateChatReply(params: {
  businessName: string;
  contextChunks: string[];
  mensaje: string;
}): Promise<string> {
  const { businessName, contextChunks, mensaje } = params;
  const client = getAnthropic();

  const context =
    contextChunks.length > 0
      ? contextChunks.map((c, i) => `[${i + 1}]\n${c}`).join("\n\n")
      : "(Sin contexto documental disponible)";

  const system = `Sos el asistente virtual de "${businessName}". Respondé en español, de forma clara y amable.
Usá SOLO la información del contexto para responder. Si no hay datos suficientes, pedí disculpas y sugerí contactar al negocio.
No inventes horarios, precios ni servicios.`;

  const userPrompt = `Contexto del negocio:

${context}

---

Pregunta del usuario: ${mensaje}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Claude no devolvió texto");
  }

  return block.text;
}
