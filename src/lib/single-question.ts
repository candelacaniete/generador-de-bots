/**
 * El modelo a veces pega el cuestionario completo en un solo mensaje.
 * Acá se deja una sola pregunta y, si pide nombre y teléfono juntos, solo el nombre.
 */

const CONTACT_REQUEST =
  /\b(pas[aá](?:me|s)?|pasar|dec[ií](?:me)?|deci|necesit\w*|dej[aá](?:me)?|deja|mand[aá](?:me)?|indic[aá](?:me)?|nombre de pila)\b/i;

function hasName(sentence: string): boolean {
  return /\bnombre\b/i.test(sentence);
}

function hasPhone(sentence: string): boolean {
  return /\btel[eé]fono\b/i.test(sentence);
}

function sentenceAsksBothContacts(sentence: string): boolean {
  return (
    hasName(sentence) &&
    hasPhone(sentence) &&
    CONTACT_REQUEST.test(sentence)
  );
}

export function limitToOneQuestion(text: string): string {
  const original = text.trim();
  if (!original) return original;

  const single = keepFirstQuestion(original);
  const cleaned = single !== original ? cleanupTruncated(single) : single;
  return collapseBundledContact(cleaned);
}

/**
 * Cuántas veces el asistente ya preguntó, para no repetir el cuestionario.
 */
export function intakeTurnHint(
  history: Array<{ role: string; content: string }>
): string {
  const asked = history.filter(
    (message) => message.role === "assistant" && /\?/.test(message.content)
  ).length;

  if (asked === 0) {
    return "En este turno todavía no hay preguntas tuyas en el historial. Si es un caso a diagnosticar, respondé con una sola pregunta.";
  }

  return `En el historial ya hay ${asked} pregunta(s) tuya(s). No las repitas. Si este mensaje es un caso y todavía faltan datos para derivarlo, hacé solo la siguiente pregunta de diagnóstico. Si ya alcanza, derivá al equipo humano y pedí un solo dato de contacto (primero el nombre; el teléfono, en el turno siguiente).`;
}

function keepFirstQuestion(text: string): string {
  const questionMarks = [...text.matchAll(/\?/g)];
  if (questionMarks.length <= 1) return text.trim();

  const openings = [...text.matchAll(/¿/g)];
  if (openings.length >= 2) {
    const cut = openings[1].index ?? 0;
    return text
      .slice(0, cut)
      .replace(/(?:^|\n)\s*(?:\*\*)?\s*\d+[.)]\s*(?:\*\*)?\s*$/g, "")
      .trim();
  }

  const firstMark = questionMarks[0].index ?? 0;
  return text.slice(0, firstMark + 1).trim();
}

function cleanupTruncated(text: string): string {
  return text
    .replace(
      /para poder ayudarte mejor,?\s*me gustar[ií]a aclarar(?:te)? un par de cosas:\s*/i,
      ""
    )
    .replace(/\*\*/g, "")
    .replace(/(^|\n)\s*\d+[.)]\s+(?=¿)/g, "$1")
    .replace(/([^\n])\n(¿)/g, "$1\n\n$2")
    .replace(/([.!?])\s+(¿)/g, "$1\n\n$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collapseBundledContact(text: string): string {
  const sentences = splitSentences(text);
  const bundleAt = sentences.findIndex(sentenceAsksBothContacts);
  if (bundleAt === -1) return text;

  const before = sentences.slice(0, bundleAt).join(" ").trim();
  if (before.includes("?")) return before;

  const head = before.replace(/[:\s]+$/g, "").trim();
  const ask = "¿Cuál es tu nombre?";
  return head ? `${head}\n\n${ask}` : ask;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
