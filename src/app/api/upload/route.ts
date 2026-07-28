import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/auth";
import { chunkText } from "@/lib/chunk";
import { embedTexts } from "@/lib/embeddings";
import { extractText } from "@/lib/extract";
import { slugify } from "@/lib/slug";
import { getSupabase } from "@/lib/supabase";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB (límite práctico Hobby de Vercel)

function missingEnv(): string | null {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
  ] as const;

  const missing = required.filter((key) => !env(key));
  if (missing.length === 0) return null;
  return `Faltan variables de entorno: ${missing.join(", ")} (también acepta minúsculas)`;
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "name" in value &&
    typeof (value as File).arrayBuffer === "function"
  );
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireAdminApiAccess(req);
    if (!access.ok) return access.response;

    const envError = missingEnv();
    if (envError) {
      return NextResponse.json({ error: envError }, { status: 500 });
    }

    const form = await req.formData();
    const nombre = String(form.get("nombre") ?? "").trim();
    const file = form.get("archivo");

    if (!nombre) {
      return NextResponse.json(
        { error: "El nombre del negocio es obligatorio" },
        { status: 400 }
      );
    }

    if (!isUploadFile(file)) {
      return NextResponse.json(
        { error: "Debés subir un archivo .docx o .pdf" },
        { status: 400 }
      );
    }

    const filename = file.name || "documento";
    const lower = filename.toLowerCase();
    if (!lower.endsWith(".docx") && !lower.endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Solo se aceptan archivos .docx o .pdf" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "El archivo supera el límite de 4 MB" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const texto = await extractText(buffer, filename);

    if (!texto || texto.length < 20) {
      return NextResponse.json(
        {
          error:
            "No se pudo extraer texto útil del archivo. Verificá que no sea un escaneo sin OCR.",
        },
        { status: 400 }
      );
    }

    const chunks = chunkText(texto);
    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "El documento quedó vacío después del procesamiento" },
        { status: 400 }
      );
    }

    const embeddings = await embedTexts(chunks);
    const supabase = getSupabase();
    const slug = slugify(nombre);

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .insert({ nombre, slug })
      .select("id, nombre, slug")
      .single();

    if (businessError || !business) {
      console.error(businessError);
      const detail = businessError?.message ?? "error desconocido";
      const hint =
        detail.toLowerCase().includes("path") ||
        detail.toLowerCase().includes("schema cache") ||
        detail.toLowerCase().includes("does not exist")
          ? " Revisá que next_public_supabase_url sea exactamente https://TU-REF.supabase.co (Settings → API → Project URL) y que hayas ejecutado supabase/schema.sql."
          : "";
      return NextResponse.json(
        {
          error: `No se pudo crear el negocio: ${detail}.${hint}`,
        },
        { status: 500 }
      );
    }

    const { data: document, error: documentError } = await supabase
      .from("documents")
      .insert({
        business_id: business.id,
        nombre_archivo: filename,
        texto_extraido: texto,
      })
      .select("id")
      .single();

    if (documentError || !document) {
      console.error(documentError);
      await supabase.from("businesses").delete().eq("id", business.id);
      return NextResponse.json(
        {
          error: documentError?.message
            ? `No se pudo guardar el documento: ${documentError.message}`
            : "No se pudo guardar el documento",
        },
        { status: 500 }
      );
    }

    const rows = chunks.map((contenido, i) => ({
      document_id: document.id,
      business_id: business.id,
      contenido,
      embedding: embeddings[i],
    }));

    const { error: chunksError } = await supabase
      .from("document_chunks")
      .insert(rows);

    if (chunksError) {
      console.error(chunksError);
      await supabase.from("businesses").delete().eq("id", business.id);
      return NextResponse.json(
        {
          error: chunksError.message
            ? `No se pudieron guardar los embeddings: ${chunksError.message}`
            : "No se pudieron guardar los embeddings",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      business_id: business.id,
      nombre: business.nombre,
      slug: business.slug,
      chunks: chunks.length,
    });
  } catch (err) {
    console.error("[upload]", err);
    const message =
      err instanceof Error ? err.message : "Error interno al procesar el archivo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
