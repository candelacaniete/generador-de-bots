import { env } from "@/lib/env";

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

export function isLocalhostUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

type RequestLike = {
  nextUrl: URL;
  headers: Headers;
};

/**
 * URL pública real de la app.
 * Nunca usa localhost en producción (si next_public_app_url quedó en :3000,
 * cae al host del request o al dominio de Vercel).
 */
export function resolvePublicAppUrl(req?: RequestLike): string {
  const fromEnv = normalizeAppUrl(env("NEXT_PUBLIC_APP_URL"));
  const fromReq = req
    ? (() => {
        const host =
          req.headers.get("x-forwarded-host") ||
          req.headers.get("host") ||
          req.nextUrl.host;
        const proto =
          req.headers.get("x-forwarded-proto") ||
          req.nextUrl.protocol.replace(":", "") ||
          "https";
        if (!host) return normalizeAppUrl(req.nextUrl.origin);
        return normalizeAppUrl(`${proto}://${host}`);
      })()
    : undefined;

  if (fromEnv && !isLocalhostUrl(fromEnv)) return fromEnv;
  if (fromReq && !isLocalhostUrl(fromReq)) return fromReq;

  // Dev local explícito
  if (fromEnv) return fromEnv;
  if (fromReq) return fromReq;

  return "https://generador-de-bots.vercel.app";
}
