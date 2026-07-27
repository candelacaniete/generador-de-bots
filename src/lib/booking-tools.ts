import type Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "@/lib/supabase";
import {
  confirmarTurno,
  consultarDiasDisponibles,
  consultarHorariosDia,
  cancelarTurno,
  crearTurno,
  listActiveServices,
  type SlotOffer,
} from "@/lib/bookings";
import {
  getConversationFlow,
  patchConversationFlow,
} from "@/lib/conversations";

export const BOOKING_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "listar_servicios",
    description:
      "Lista servicios reservables. Si hay más de uno, preguntá cuál. Si hay uno solo, seguí sin preguntar. NO uses el PDF.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "consultar_dias_disponibles",
    description:
      "Devuelve días con turnos libres. Primer paso de agenda. NO pidas nombre/teléfono todavía.",
    input_schema: {
      type: "object",
      properties: {
        service_id: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "consultar_horarios_dia",
    description:
      "Horarios libres de UN día (YYYY-MM-DD). Por defecto 5. Si el usuario pide más, llamá de nuevo con offset mayor.",
    input_schema: {
      type: "object",
      properties: {
        service_id: { type: "string" },
        fecha: {
          type: "string",
          description: "Fecha YYYY-MM-DD del día elegido",
        },
        offset: {
          type: "number",
          description: "Desde qué horario (0, 5, 10...)",
        },
        limit: {
          type: "number",
          description: "Cuántos horarios devolver (default 5)",
        },
      },
      required: ["fecha"],
      additionalProperties: false,
    },
  },
  {
    name: "seleccionar_slot",
    description:
      "Guarda el horario elegido (slot_index 0-based de los últimos horarios mostrados, o start ISO). Después pedí nombre y teléfono.",
    input_schema: {
      type: "object",
      properties: {
        slot_index: { type: "number" },
        fecha_hora: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "crear_turno",
    description:
      "Crea el turno pendiente en DB + Google Calendar. OBLIGATORIO cuando ya hay slot seleccionado + nombre + teléfono. Sin esto NO digas que quedó reservado.",
    input_schema: {
      type: "object",
      properties: {
        service_id: { type: "string" },
        servicio: { type: "string" },
        nombre_cliente: { type: "string" },
        telefono_cliente: { type: "string" },
        email_cliente: { type: "string" },
        notas: { type: "string" },
      },
      required: ["nombre_cliente", "telefono_cliente"],
      additionalProperties: false,
    },
  },
  {
    name: "obtener_info_sena",
    description:
      "Alias/CBU e instrucciones de seña. Llamala después de crear_turno si el negocio requiere seña.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "derivar_a_humano",
    description:
      "Lead manual (sin slots / obra social / requiere_derivacion_humana).",
    input_schema: {
      type: "object",
      properties: {
        nombre_cliente: { type: "string" },
        telefono_cliente: { type: "string" },
        email_cliente: { type: "string" },
        motivo: { type: "string" },
        servicio: { type: "string" },
      },
      required: ["telefono_cliente", "motivo"],
      additionalProperties: false,
    },
  },
  {
    name: "confirmar_turno",
    description: "Confirma un turno pendiente existente.",
    input_schema: {
      type: "object",
      properties: { turno_id: { type: "string" } },
      required: ["turno_id"],
      additionalProperties: false,
    },
  },
  {
    name: "cancelar_turno",
    description: "Cancela un turno y libera Calendar.",
    input_schema: {
      type: "object",
      properties: {
        turno_id: { type: "string" },
        motivo: { type: "string" },
      },
      required: ["turno_id"],
      additionalProperties: false,
    },
  },
];

type ToolContext = {
  businessId: string;
  conversationId: string | null;
};

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export async function runBookingTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  try {
    switch (name) {
      case "listar_servicios": {
        const services = await listActiveServices(ctx.businessId);
        if (ctx.conversationId) {
          await patchConversationFlow(ctx.conversationId, ctx.businessId, {
            servicios: services.map((s) => ({
              id: s.id,
              nombre: s.nombre,
              duracion_minutos: s.duracion_minutos,
              requiere_derivacion_humana: s.requiere_derivacion_humana,
            })),
          });
        }
        return JSON.stringify({
          servicios: services.map((s) => ({
            id: s.id,
            nombre: s.nombre,
            duracion_minutos: s.duracion_minutos,
            requiere_derivacion_humana: s.requiere_derivacion_humana,
          })),
        });
      }

      case "consultar_dias_disponibles": {
        const serviceId = (input.service_id as string) || null;
        const result = await consultarDiasDisponibles({
          businessId: ctx.businessId,
          serviceId,
        });
        if (ctx.conversationId) {
          await patchConversationFlow(ctx.conversationId, ctx.businessId, {
            selected_service_id: serviceId,
            last_dias: result.dias,
            selected_slot: null,
            last_slots: [],
            day_slots_offset: 0,
          });
        }
        return JSON.stringify(result);
      }

      case "consultar_horarios_dia": {
        const serviceId = (input.service_id as string) || null;
        const fecha = String(input.fecha);
        const offset = Number(input.offset ?? 0);
        const limit = Number(input.limit ?? 5);
        const result = await consultarHorariosDia({
          businessId: ctx.businessId,
          serviceId,
          fecha,
          offset,
          limit,
        });
        if (ctx.conversationId) {
          await patchConversationFlow(ctx.conversationId, ctx.businessId, {
            selected_service_id: serviceId,
            selected_fecha: fecha,
            last_slots: result.slots,
            day_slots_offset: offset,
            day_slots_has_more: result.has_more,
            day_slots_total: result.total_dia,
          });
        }
        return JSON.stringify(result);
      }

      case "seleccionar_slot": {
        if (!ctx.conversationId) {
          return JSON.stringify({ error: "Sin conversation_id" });
        }
        const flow = await getConversationFlow(
          ctx.conversationId,
          ctx.businessId
        );
        const lastSlots = (flow.last_slots as SlotOffer[] | undefined) ?? [];
        let selected: SlotOffer | null = null;

        if (input.slot_index !== undefined && input.slot_index !== null) {
          selected = lastSlots[Number(input.slot_index)] ?? null;
        } else if (input.fecha_hora) {
          const raw = String(input.fecha_hora);
          selected =
            lastSlots.find((s) => s.start === raw) ||
            lastSlots.find((s) => s.label.toLowerCase().includes(raw.toLowerCase())) ||
            null;
        }

        if (!selected) {
          return JSON.stringify({
            error: "No pude identificar el horario. Pedile que elija 1, 2, 3...",
            last_slots: lastSlots,
          });
        }

        await patchConversationFlow(ctx.conversationId, ctx.businessId, {
          selected_slot: selected.start,
          selected_slot_label: selected.label,
        });

        return JSON.stringify({
          ok: true,
          selected_slot: selected.start,
          label: selected.label,
          aviso:
            "Horario guardado. Ahora pedí nombre completo y teléfono (email opcional) y llamá crear_turno.",
        });
      }

      case "crear_turno": {
        const services = await listActiveServices(ctx.businessId);
        const flow = ctx.conversationId
          ? await getConversationFlow(ctx.conversationId, ctx.businessId)
          : {};

        let serviceId =
          (input.service_id as string) ||
          (typeof flow.selected_service_id === "string"
            ? flow.selected_service_id
            : null);

        let svc = serviceId
          ? services.find((s) => s.id === serviceId) ?? null
          : null;

        if (!svc && input.servicio) {
          const want = normalizeName(String(input.servicio));
          svc =
            services.find((s) => normalizeName(s.nombre) === want) ||
            services.find(
              (s) =>
                normalizeName(s.nombre).includes(want) ||
                want.includes(normalizeName(s.nombre))
            ) ||
            null;
          if (svc) serviceId = svc.id;
        }
        if (!svc && services.length === 1) {
          svc = services[0];
          serviceId = svc.id;
        }

        if (svc?.requiere_derivacion_humana) {
          return JSON.stringify({
            error:
              "Este servicio requiere derivación humana. Usá derivar_a_humano.",
          });
        }

        const fechaHora =
          typeof flow.selected_slot === "string" ? flow.selected_slot : null;
        if (!fechaHora) {
          return JSON.stringify({
            error:
              "No hay horario seleccionado. Primero seleccionar_slot después de consultar_horarios_dia.",
          });
        }

        const created = await crearTurno({
          businessId: ctx.businessId,
          serviceId: svc?.id ?? serviceId,
          servicio: String(input.servicio || svc?.nombre || "Turno"),
          fechaHoraIso: fechaHora,
          duracionMinutos: svc?.duracion_minutos || 30,
          nombreCliente: String(input.nombre_cliente),
          telefonoCliente: String(input.telefono_cliente),
          emailCliente: (input.email_cliente as string) || null,
          conversationId: ctx.conversationId,
          notas: (input.notas as string) || null,
        });

        if (ctx.conversationId) {
          await patchConversationFlow(ctx.conversationId, ctx.businessId, {
            last_booking_id: created.bookingId,
            last_booking_estado: created.estado,
          });
        }

        return JSON.stringify({
          ok: true,
          ...created,
          fecha_hora_usada: fechaHora,
          label: flow.selected_slot_label ?? null,
          aviso:
            "Turno REAL creado (pendiente) y bloqueado en Google Calendar.",
        });
      }

      case "obtener_info_sena": {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from("businesses")
          .select("requiere_sena, alias_cbu, instrucciones_sena, nombre")
          .eq("id", ctx.businessId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return JSON.stringify({
          requiere_sena: data?.requiere_sena ?? false,
          alias_cbu: data?.alias_cbu ?? null,
          instrucciones_sena: data?.instrucciones_sena ?? null,
        });
      }

      case "derivar_a_humano": {
        const lead = {
          derivado: true,
          derivado_en: new Date().toISOString(),
          nombre_cliente: String(input.nombre_cliente || "Sin nombre"),
          telefono_cliente: String(input.telefono_cliente),
          email_cliente: (input.email_cliente as string) || null,
          servicio: (input.servicio as string) || null,
          motivo: String(input.motivo ?? "Derivación manual"),
        };
        if (ctx.conversationId) {
          await patchConversationFlow(ctx.conversationId, ctx.businessId, {
            lead,
          });
        }
        return JSON.stringify({ ok: true, lead });
      }

      case "confirmar_turno": {
        return JSON.stringify(
          await confirmarTurno(String(input.turno_id), ctx.businessId)
        );
      }

      case "cancelar_turno": {
        return JSON.stringify(
          await cancelarTurno(
            String(input.turno_id),
            ctx.businessId,
            (input.motivo as string) || undefined
          )
        );
      }

      default:
        return JSON.stringify({ error: `Tool desconocida: ${name}` });
    }
  } catch (err) {
    console.error("[tool]", name, err);
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Error en la tool",
    });
  }
}

/** Safety net: si hay slot + teléfono en el mensaje y aún no hay booking, crea el turno. */
export async function maybeAutoCreateBooking(params: {
  businessId: string;
  conversationId: string | null;
  userMessage: string;
  requiereSena: boolean;
}): Promise<{ created: boolean; summary?: string; error?: string }> {
  if (!params.conversationId) return { created: false };

  const flow = await getConversationFlow(
    params.conversationId,
    params.businessId
  );
  if (flow.last_booking_id) return { created: false };
  if (typeof flow.selected_slot !== "string" || !flow.selected_slot) {
    return { created: false };
  }

  const phoneMatch = params.userMessage.match(
    /(?:\+?\d[\d\s\-()]{7,}\d)/
  );
  if (!phoneMatch) return { created: false };

  const telefono = phoneMatch[0].replace(/[^\d+]/g, "");
  // Nombre: texto antes del teléfono, limpiando email
  let nombre = params.userMessage
    .replace(phoneMatch[0], " ")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, " ")
    .replace(/[,;|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (nombre.length < 2) nombre = "Cliente";

  const emailMatch = params.userMessage.match(
    /[\w.+-]+@[\w-]+\.[\w.-]+/
  );

  const resultRaw = await runBookingTool(
    "crear_turno",
    {
      nombre_cliente: nombre,
      telefono_cliente: telefono,
      email_cliente: emailMatch?.[0] || undefined,
    },
    {
      businessId: params.businessId,
      conversationId: params.conversationId,
    }
  );

  const parsed = JSON.parse(resultRaw) as {
    ok?: boolean;
    error?: string;
    bookingId?: string;
    label?: string;
    fecha_hora_usada?: string;
  };

  if (!parsed.ok) {
    return { created: false, error: parsed.error };
  }

  let senaText = "";
  if (params.requiereSena) {
    const senaRaw = await runBookingTool(
      "obtener_info_sena",
      {},
      {
        businessId: params.businessId,
        conversationId: params.conversationId,
      }
    );
    const sena = JSON.parse(senaRaw) as {
      alias_cbu?: string;
      instrucciones_sena?: string;
    };
    senaText = `\n\nPara confirmar el turno (queda pendiente):\n${
      sena.instrucciones_sena || "Transferí la seña"
    }${sena.alias_cbu ? `\nAlias/CBU: ${sena.alias_cbu}` : ""}`;
  }

  const summary = `¡Listo! Reservamos tu turno en estado *pendiente*.
- Horario: ${flow.selected_slot_label || parsed.fecha_hora_usada}
- Nombre: ${nombre}
- Teléfono: ${telefono}
${emailMatch ? `- Email: ${emailMatch[0]}` : ""}
- ID: ${parsed.bookingId}${senaText}

El horario ya quedó bloqueado en la agenda.`;

  return { created: true, summary };
}
