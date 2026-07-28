import { NextRequest, NextResponse } from "next/server";
import { requireBusinessApiAccess } from "@/lib/auth";
import { cancelarTurno, confirmarTurno } from "@/lib/bookings";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("business_id")?.trim();
  if (!businessId) {
    return NextResponse.json({ error: "business_id obligatorio" }, { status: 400 });
  }

  const access = await requireBusinessApiAccess(req, businessId);
  if (!access.ok) return access.response;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, servicio, fecha_hora, duracion_minutos, estado, nombre_cliente, telefono_cliente, email_cliente, notas, created_at, expires_at"
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ bookings: data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const businessId = String(body.business_id ?? "").trim();
    const bookingId = String(body.booking_id ?? "").trim();
    const action = String(body.action ?? "").trim();

    if (!businessId || !bookingId || !action) {
      return NextResponse.json(
        { error: "business_id, booking_id y action son obligatorios" },
        { status: 400 }
      );
    }

    const access = await requireBusinessApiAccess(req, businessId);
    if (!access.ok) return access.response;

    if (action === "confirmar") {
      const result = await confirmarTurno(bookingId, businessId);
      return NextResponse.json(result);
    }

    if (action === "cancelar") {
      const result = await cancelarTurno(
        bookingId,
        businessId,
        body.motivo ? String(body.motivo) : undefined
      );
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "action inválida" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
