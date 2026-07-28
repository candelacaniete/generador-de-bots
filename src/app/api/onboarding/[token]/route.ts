import { NextRequest, NextResponse } from "next/server";
import { chunkText } from "@/lib/chunk";
import { embedTexts } from "@/lib/embeddings";
import { buildOnboardingKnowledgeText } from "@/lib/onboarding-text";
import { slugify } from "@/lib/slug";
import { getSupabase } from "@/lib/supabase";
import { DEFAULT_HORARIO, type HorarioLaboral } from "@/lib/schedule";

export const runtime = "nodejs";
export const maxDuration = 60;

type ServiceInput = {
  nombre: string;
  duracion_minutos: number;
  precio?: string;
};

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const supabase = getSupabase();
  const { data } = await supabase
    .from("onboarding_tokens")
    .select("token, expires_at, usado_en")
    .eq("token", token)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  }
  if (data.usado_en) {
    return NextResponse.json({ error: "Este link ya fue usado" }, { status: 410 });
  }
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Este link expiró" }, { status: 410 });
  }

  return NextResponse.json({ ok: true, expires_at: data.expires_at });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const supabase = getSupabase();

  try {
    const { data: row, error: tokenErr } = await supabase
      .from("onboarding_tokens")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (tokenErr) throw new Error(tokenErr.message);
    if (!row) {
      return NextResponse.json({ error: "Link inválido" }, { status: 404 });
    }
    if (row.usado_en) {
      return NextResponse.json(
        { error: "Este link ya fue usado" },
        { status: 410 }
      );
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Este link expiró" }, { status: 410 });
    }

    const body = await req.json();
    const nombre = String(body.nombre ?? "").trim();
    const ownerEmail = String(body.owner_email ?? "").trim().toLowerCase();
    const faq = String(body.faq ?? "").trim();
    const horariosTexto = String(body.horarios ?? "").trim();
    const aliasCbu = body.alias_cbu ? String(body.alias_cbu).trim() : "";
    const instruccionesSena = body.instrucciones_sena
      ? String(body.instrucciones_sena).trim()
      : "";
    const color = String(body.color_primario ?? "#2563eb").trim();
    const colorPrimario = /^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#2563eb";
    const services = (Array.isArray(body.services) ? body.services : []) as ServiceInput[];

    if (!nombre || nombre.length < 2) {
      return NextResponse.json(
        { error: "Nombre del negocio obligatorio" },
        { status: 400 }
      );
    }
    if (!ownerEmail || !ownerEmail.includes("@")) {
      return NextResponse.json(
        { error: "Email de contacto obligatorio" },
        { status: 400 }
      );
    }
    const validServices = services.filter((s) => s.nombre?.trim());
    if (!validServices.length) {
      return NextResponse.json(
        { error: "Agregá al menos un servicio" },
        { status: 400 }
      );
    }

    const texto = buildOnboardingKnowledgeText({
      nombre,
      services: validServices,
      horarios: horariosTexto,
      faq,
      aliasCbu,
      instruccionesSena,
    });

    const chunks = chunkText(texto);
    const embeddings = await embedTexts(chunks);
    const slug = slugify(nombre);

    const { data: business, error: bizErr } = await supabase
      .from("businesses")
      .insert({
        nombre,
        slug,
        agenda_habilitada: false,
        requiere_sena: Boolean(aliasCbu || instruccionesSena),
        alias_cbu: aliasCbu || null,
        instrucciones_sena: instruccionesSena || null,
        color_primario: colorPrimario,
        owner_email: ownerEmail,
        email_notificaciones: ownerEmail,
      })
      .select("id, nombre")
      .single();

    if (bizErr || !business) {
      throw new Error(bizErr?.message || "No se pudo crear el negocio");
    }

    const { data: document, error: docErr } = await supabase
      .from("documents")
      .insert({
        business_id: business.id,
        nombre_archivo: "onboarding-base-conocimiento.pdf",
        texto_extraido: texto,
      })
      .select("id")
      .single();

    if (docErr || !document) {
      await supabase.from("businesses").delete().eq("id", business.id);
      throw new Error(docErr?.message || "No se pudo guardar el documento");
    }

    const rows = chunks.map((contenido, i) => ({
      document_id: document.id,
      business_id: business.id,
      contenido,
      embedding: embeddings[i],
    }));

    const { error: chunksErr } = await supabase
      .from("document_chunks")
      .insert(rows);
    if (chunksErr) {
      await supabase.from("businesses").delete().eq("id", business.id);
      throw new Error(chunksErr.message);
    }

    for (const svc of validServices) {
      await supabase.from("services").insert({
        business_id: business.id,
        nombre: svc.nombre.trim(),
        duracion_minutos: Number(svc.duracion_minutos) || 30,
        precio: svc.precio?.trim() || null,
        activo: true,
      });
    }

    // calendario vacío (sin OAuth aún)
    await supabase.from("business_calendar_config").upsert(
      {
        business_id: business.id,
        horario_laboral: DEFAULT_HORARIO as HorarioLaboral,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: "business_id" }
    );

    await supabase
      .from("onboarding_tokens")
      .update({
        usado_en: new Date().toISOString(),
        business_id: business.id,
      })
      .eq("token", token);

    return NextResponse.json({
      ok: true,
      business_id: business.id,
      mensaje:
        "Recibimos tu info. Te contactamos para activar el bot y la agenda.",
    });
  } catch (err) {
    console.error("[onboarding]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al guardar" },
      { status: 500 }
    );
  }
}
