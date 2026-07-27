import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { DEFAULT_HORARIO, type HorarioLaboral } from "@/lib/schedule";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("business_id")?.trim();
  if (!businessId) {
    return NextResponse.json({ error: "business_id obligatorio" }, { status: 400 });
  }

  const supabase = getSupabase();
  const [{ data: business }, { data: config }, { data: services }] =
    await Promise.all([
      supabase
        .from("businesses")
        .select(
          "id, nombre, agenda_habilitada, requiere_sena, alias_cbu, instrucciones_sena"
        )
        .eq("id", businessId)
        .maybeSingle(),
      supabase
        .from("business_calendar_config")
        .select(
          "google_calendar_id, google_account_email, horario_laboral, duracion_default_minutos, slot_interval_minutos, dias_hacia_adelante, minutos_expiracion_pendiente, conectado_en"
        )
        .eq("business_id", businessId)
        .maybeSingle(),
      supabase
        .from("services")
        .select("*")
        .eq("business_id", businessId)
        .order("nombre"),
    ]);

  if (!business) {
    return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    business,
    config: config
      ? {
          ...config,
          conectado: Boolean(config.conectado_en),
          horario_laboral: {
            ...DEFAULT_HORARIO,
            ...(config.horario_laboral as object),
          },
        }
      : {
          conectado: false,
          google_calendar_id: "primary",
          google_account_email: null,
          horario_laboral: DEFAULT_HORARIO,
          duracion_default_minutos: 30,
          slot_interval_minutos: 30,
          dias_hacia_adelante: 14,
          minutos_expiracion_pendiente: 30,
          conectado_en: null,
        },
    services: services ?? [],
  });
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const businessId = String(body.business_id ?? "").trim();
    if (!businessId) {
      return NextResponse.json({ error: "business_id obligatorio" }, { status: 400 });
    }

    const supabase = getSupabase();

    const businessPatch: Record<string, unknown> = {};
    if (typeof body.agenda_habilitada === "boolean") {
      businessPatch.agenda_habilitada = body.agenda_habilitada;
    }
    if (typeof body.requiere_sena === "boolean") {
      businessPatch.requiere_sena = body.requiere_sena;
    }
    if ("alias_cbu" in body) businessPatch.alias_cbu = body.alias_cbu;
    if ("instrucciones_sena" in body) {
      businessPatch.instrucciones_sena = body.instrucciones_sena;
    }

    if (Object.keys(businessPatch).length) {
      const { error } = await supabase
        .from("businesses")
        .update(businessPatch)
        .eq("id", businessId);
      if (error) throw new Error(error.message);
    }

    if (body.config) {
      const cfg = body.config as {
        google_calendar_id?: string;
        horario_laboral?: HorarioLaboral;
        duracion_default_minutos?: number;
        slot_interval_minutos?: number;
        dias_hacia_adelante?: number;
        minutos_expiracion_pendiente?: number;
      };

      const { error } = await supabase.from("business_calendar_config").upsert(
        {
          business_id: businessId,
          google_calendar_id: cfg.google_calendar_id || "primary",
          horario_laboral: cfg.horario_laboral || DEFAULT_HORARIO,
          duracion_default_minutos: cfg.duracion_default_minutos ?? 30,
          slot_interval_minutos: cfg.slot_interval_minutos ?? 30,
          dias_hacia_adelante: cfg.dias_hacia_adelante ?? 14,
          minutos_expiracion_pendiente: cfg.minutos_expiracion_pendiente ?? 30,
          actualizado_en: new Date().toISOString(),
        },
        { onConflict: "business_id" }
      );
      if (error) throw new Error(error.message);
    }

    if (Array.isArray(body.services)) {
      // Replace-lite: upsert by id or insert new; deactivate missing not handled for simplicity
      for (const svc of body.services as Array<{
        id?: string;
        nombre: string;
        duracion_minutos: number;
        requiere_derivacion_humana?: boolean;
        activo?: boolean;
      }>) {
        if (!svc.nombre?.trim()) continue;
        if (svc.id) {
          await supabase
            .from("services")
            .update({
              nombre: svc.nombre.trim(),
              duracion_minutos: Number(svc.duracion_minutos) || 30,
              requiere_derivacion_humana: Boolean(svc.requiere_derivacion_humana),
              activo: svc.activo !== false,
            })
            .eq("id", svc.id)
            .eq("business_id", businessId);
        } else {
          await supabase.from("services").insert({
            business_id: businessId,
            nombre: svc.nombre.trim(),
            duracion_minutos: Number(svc.duracion_minutos) || 30,
            requiere_derivacion_humana: Boolean(svc.requiere_derivacion_humana),
            activo: svc.activo !== false,
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al guardar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
