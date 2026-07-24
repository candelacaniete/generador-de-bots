import { NextRequest, NextResponse } from "next/server";
import { generateChatReply } from "@/lib/anthropic";
import { embedText } from "@/lib/embeddings";
import { getSupabase, type MatchedChunk } from "@/lib/supabase";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 30;

type ChatBody = {
  business_id?: string;
  mensaje?: string;
};

function missingEnv(): string | null {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
  ] as const;
  const missing = required.filter((key) => !env(key));
  if (missing.length === 0) return null;
  return `Faltan variables de entorno: ${missing
    .map((k) => k.toLowerCase())
    .join(", ")}`;
}

export async function POST(req: NextRequest) {
  try {
    const envError = missingEnv();
    if (envError) {
      return NextResponse.json(
        { error: envError },
        { status: 500, headers: corsHeaders() }
      );
    }

    const body = (await req.json()) as ChatBody;
    const businessId = String(body.business_id ?? "").trim();
    const mensaje = String(body.mensaje ?? "").trim();

    if (!businessId) {
      return NextResponse.json(
        { error: "business_id es obligatorio" },
        { status: 400, headers: corsHeaders() }
      );
    }

    if (!mensaje) {
      return NextResponse.json(
        { error: "mensaje es obligatorio" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const supabase = getSupabase();

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, nombre")
      .eq("id", businessId)
      .maybeSingle();

    if (businessError) {
      console.error(businessError);
      return NextResponse.json(
        { error: `Error al buscar el negocio: ${businessError.message}` },
        { status: 500, headers: corsHeaders() }
      );
    }

    if (!business) {
      return NextResponse.json(
        { error: "Negocio no encontrado" },
        { status: 404, headers: corsHeaders() }
      );
    }

    const queryEmbedding = await embedText(mensaje);

    // PostgREST acepta el vector como string "[1,2,...]" de forma más fiable
    const { data: matches, error: matchError } = await supabase.rpc(
      "match_document_chunks",
      {
        query_embedding: `[${queryEmbedding.join(",")}]`,
        match_business_id: businessId,
        match_count: 5,
      }
    );

    if (matchError) {
      console.error(matchError);
      return NextResponse.json(
        {
          error: `Error en la búsqueda semántica: ${matchError.message}. Si no ejecutaste el SQL completo, corré la función match_document_chunks en Supabase.`,
        },
        { status: 500, headers: corsHeaders() }
      );
    }

    const chunks = (matches as MatchedChunk[] | null) ?? [];
    const contextChunks = chunks.map((c) => c.contenido);

    const respuesta = await generateChatReply({
      businessName: business.nombre,
      contextChunks,
      mensaje,
    });

    return NextResponse.json(
      {
        respuesta,
        fuentes: chunks.map((c) => ({
          id: c.id,
          similarity: c.similarity,
        })),
      },
      { headers: corsHeaders() }
    );
  } catch (err) {
    console.error("[chat]", err);
    const message =
      err instanceof Error ? err.message : "Error interno del chat";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
