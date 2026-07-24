import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno"
    );
  }

  if (!/^https?:\/\/.+/i.test(url) || url.startsWith("eyJ")) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL inválida ("${url.slice(0, 40)}…"). Debe ser la Project URL, ej. https://xxxx.supabase.co — no la API key.`
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
