/**
 * Divide texto en chunks ~500 tokens (~2000 chars) con solapamiento.
 * Aproxima 1 token ≈ 4 caracteres (español/inglés mixto).
 */
const TARGET_CHARS = 2000;
const OVERLAP_CHARS = 200;

export function chunkText(text: string): string[] {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) return [];
  if (normalized.length <= TARGET_CHARS) return [normalized];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + TARGET_CHARS, normalized.length);

    if (end < normalized.length) {
      const slice = normalized.slice(start, end);
      const breakAt = findBreak(slice);
      if (breakAt > TARGET_CHARS * 0.4) {
        end = start + breakAt;
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);

    if (end >= normalized.length) break;
    start = Math.max(0, end - OVERLAP_CHARS);
  }

  return chunks;
}

function findBreak(slice: string): number {
  const candidates = ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " "];
  for (const sep of candidates) {
    const idx = slice.lastIndexOf(sep);
    if (idx !== -1) return idx + sep.length;
  }
  return slice.length;
}
