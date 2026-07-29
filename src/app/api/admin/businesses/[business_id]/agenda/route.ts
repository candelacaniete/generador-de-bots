import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Solo admin: prender/apagar turnera (agenda_habilitada) por negocio.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ business_id: string }> }
) {
  const access = await requireAdminApiAccess(req);
  if (!access.ok) return access.response;

  const { business_id } = await context.params;
  const businessId = business_id?.trim();
  if (!businessId) {
    return NextResponse.json({ error: "business_id obligatorio" }, { status: 400 });
  }

  try {
    const body = await req.json();
    if (typeof body.agenda_habilitada !== "boolean") {
      return NextResponse.json(
        { error: "agenda_habilitada (boolean) es obligatorio" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("businesses")
      .update({ agenda_habilitada: body.agenda_habilitada })
      .eq("id", businessId)
      .select("id, nombre, agenda_habilitada")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      business_id: data.id,
      agenda_habilitada: data.agenda_habilitada,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
