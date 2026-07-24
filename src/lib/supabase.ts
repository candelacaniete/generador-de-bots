import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let client: SupabaseClient | null = null;

/**
 * Normaliza la Project URL de Supabase.
 * Acepta solo https://<ref>.supabase.co (sin /rest/v1 ni URLs del dashboard).
 */
export function normalizeSupabaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");

  if (url.startsWith("eyJ") || url.startsWith("sb_")) {
    throw new Error(
      "Pegaste una API key en next_public_supabase_url. Ahí va la Project URL (https://xxxx.supabase.co)."
    );
  }

  if (!/^https?:\/\//i.test(url)) {
    // Si solo pegaron el project ref
    if (/^[a-z0-9-]+$/i.test(url)) {
      url = `https://${url}.supabase.co`;
    } else {
      throw new Error(
        `next_public_supabase_url inválida ("${raw}"). Debe ser https://xxxx.supabase.co`
      );
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `next_public_supabase_url no es una URL válida ("${raw}").`
    );
  }

  if (
    parsed.hostname === "supabase.com" ||
    parsed.hostname.endsWith(".supabase.com")
  ) {
    throw new Error(
      "Pegaste la URL del dashboard de Supabase. Usá Project Settings → API → Project URL (https://xxxx.supabase.co)."
    );
  }

  // Quitar /rest/v1 u otros paths que rompen el client
  if (parsed.pathname && parsed.pathname !== "/") {
    parsed.pathname = "/";
  }
  parsed.search = "";
  parsed.hash = "";

  return parsed.origin;
}

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const rawUrl = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");

  if (!rawUrl || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno"
    );
  }

  const url = normalizeSupabaseUrl(rawUrl);

  if (!key.startsWith("eyJ") && !key.startsWith("sb_")) {
    throw new Error(
      "supabase_service_role_key parece inválida. Pegá la clave service_role (JWT eyJ... o sb_secret_...)."
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}

export type Business = {
  id: string;
  nombre: string;
  slug: string;
  creado_en: string;
};

export type DocumentRow = {
  id: string;
  business_id: string;
  nombre_archivo: string;
  texto_extraido: string;
  subido_en: string;
};

export type DocumentChunk = {
  id: string;
  document_id: string;
  business_id: string;
  contenido: string;
  embedding: number[] | null;
  creado_en: string;
};

export type MatchedChunk = {
  id: string;
  document_id: string;
  business_id: string;
  contenido: string;
  similarity: number;
};
