/**
 * Normaliza la URL pública de la app.
 * Acepta "generador-de-bots.vercel.app" o "https://generador-de-bots.vercel.app/".
 */
export function normalizeAppUrl(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  let url = raw.trim().replace(/\/+$/, "");
  if (!url) return undefined;

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return undefined;
  }
}
