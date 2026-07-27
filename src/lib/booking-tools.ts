import type Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "@/lib/supabase";
import {
  confirmarTurno,
  consultarDisponibilidad,
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
      "Lista SOLO los servicios reservables del negocio (tabla services). Obligatorio antes de ofrecer turnos. No uses el PDF para armar la lista de reserva.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "consultar_disponibilidad",
    description:
      "Consulta horarios libres reales en Google Calendar. Nunca inventes horarios. Devolve slots con start ISO; ese start exacto se usa en crear_turno.",
    input_schema: {
      type: "object",
      properties: {
        service_id: {
          type: "string",
          description: "ID del servicio de listar_servicios",
        },
        fecha_desde: {
          type: "string",
          description: "ISO datetime opcional desde cuándo buscar",
        },
        cantidad: {
          type: "number",
          description: "Cantidad de slots a ofrecer (default 4)",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "crear_turno",
    description:
      "Crea el turno pendiente y bloquea el slot en Google Calendar. OBLIGATORIO antes de decirle al usuario que quedó reservado. Usá fecha_hora = start ISO de un slot ofrecido, o slot_index (0-based).",
    input_schema: {
      type: "object",
      properties: {
        service_id: { type: "string" },
        servicio: { type: "string" },
        fecha_hora: {
          type: "string",
          description: "ISO datetime exacto del slot (campo start)",
        },
        slot_index: {
          type: "number",
          description: "Índice del slot ofrecido (0,1,2...) si no pasás fecha_hora",
        },
        duracion_minutos: { type: "number" },
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
      "Obtiene alias/CBU e instrucciones de seña. Llamala después de crear_turno si el negocio requiere seña.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "derivar_a_humano",
    description:
      "Guarda lead para seguimiento manual (sin slots, obra social, o servicio con requiere_derivacion_humana).",
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
    description: "Confirma un turno pendiente ya creado (turno_id real).",
    input_schema: {
      type: "object",
      properties: {
        turno_id: { type: "string" },
      },
      required: ["turno_id"],
      additionalProperties: false,
    },
  },
  {
    name: "cancelar_turno",
    description: "Cancela un turno y libera el evento en Google Calendar.",
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
      case "consultar_disponibilidad": {
        const result = await consultarDisponibilidad({
          businessId: ctx.businessId,
          serviceId: (input.service_id as string) || null,
          fechaDesde: (input.fecha_desde as string) || null,
          cantidad: Number(input.cantidad ?? 4),
        });

        if (ctx.conversationId) {
          await patchConversationFlow(ctx.conversationId, ctx.businessId, {
            last_slots: result.slots,
            selected_service_id: (input.service_id as string) || null,
            timezone: result.timezone,
          });
        }

        return JSON.stringify(result);
      }
      case "crear_turno": {
        const services = await listActiveServices(ctx.businessId);
        const flow = ctx.conversationId
          ? await getConversationFlow(ctx.conversationId, ctx.businessId)
          : {};

        let serviceId = (input.service_id as string) || null;
        if (
          !serviceId &&
          typeof flow.selected_service_id === "string" &&
          flow.selected_service_id
        ) {
          serviceId = flow.selected_service_id;
        }

        let svc = serviceId
          ? services.find((s) => s.id === serviceId) ?? null
          : null;

        if (!svc && input.servicio) {
          const want = normalizeName(String(input.servicio));
          svc =
            services.find((s) => normalizeName(s.nombre) === want) ||
            services.find((s) => normalizeName(s.nombre).includes(want) || want.includes(normalizeName(s.nombre))) ||
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
              "Este servicio requiere derivación humana. No crear turno automático. Usá derivar_a_humano.",
          });
        }

        const lastSlots = (flow.last_slots as SlotOffer[] | undefined) ?? [];
        let fechaHora = input.fecha_hora ? String(input.fecha_hora) : "";

        if (
          (input.slot_index !== undefined && input.slot_index !== null) ||
          (!fechaHora && lastSlots.length === 1)
        ) {
          const idx =
            input.slot_index !== undefined && input.slot_index !== null
              ? Number(input.slot_index)
              : 0;
          const slot = lastSlots[idx];
          if (!slot) {
            return JSON.stringify({
              error: `slot_index ${idx} inválido. Slots disponibles: ${JSON.stringify(lastSlots)}`,
            });
          }
          fechaHora = slot.start;
        }

        // Si el modelo inventó una fecha que no está en last_slots, intentar matchear por hora
        if (fechaHora && lastSlots.length) {
          const exact = lastSlots.find((s) => s.start === fechaHora);
          if (!exact) {
            const parsed = Date.parse(fechaHora);
            const byTime = Number.isFinite(parsed)
              ? lastSlots.find((s) => {
                  const a = new Date(s.start);
                  const b = new Date(parsed);
                  return (
                    a.getUTCFullYear() === b.getUTCFullYear() &&
                    a.getUTCMonth() === b.getUTCMonth() &&
                    a.getUTCDate() === b.getUTCDate() &&
                    a.getUTCHours() === b.getUTCHours() &&
                    a.getUTCMinutes() === b.getUTCMinutes()
                  );
                })
              : null;
            if (byTime) {
              fechaHora = byTime.start;
            } else {
              // Match "10:30" style against labels
              const raw = String(input.fecha_hora || "");
              const hm = raw.match(/\b(\d{1,2}):(\d{2})\b/);
              if (hm) {
                const labelHit = lastSlots.find((s) =>
                  s.label.includes(`${hm[1].padStart(2, "0")}:${hm[2]}`) ||
                  s.label.includes(`${Number(hm[1])}:${hm[2]}`)
                );
                if (labelHit) fechaHora = labelHit.start;
              }
            }
          }
        }

        if (!fechaHora) {
          return JSON.stringify({
            error:
              "Falta fecha_hora o slot_index. Primero consultá disponibilidad y usá el start ISO de un slot.",
            last_slots: lastSlots,
          });
        }

        const duracion =
          Number(input.duracion_minutos) ||
          svc?.duracion_minutos ||
          30;

        const created = await crearTurno({
          businessId: ctx.businessId,
          serviceId: svc?.id ?? serviceId,
          servicio: String(input.servicio || svc?.nombre || "Turno"),
          fechaHoraIso: fechaHora,
          duracionMinutos: duracion,
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
            selected_slot: fechaHora,
          });
        }

        return JSON.stringify({
          ok: true,
          ...created,
          fecha_hora_usada: fechaHora,
          aviso:
            "Turno REAL creado en estado pendiente y bloqueado en Google Calendar. Solo ahora podés decirle al usuario que quedó reservado como pendiente.",
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

        return JSON.stringify({
          ok: true,
          mensaje:
            "Datos guardados. Avisá al usuario que el negocio lo va a contactar.",
          lead,
        });
      }
      case "confirmar_turno": {
        const result = await confirmarTurno(
          String(input.turno_id),
          ctx.businessId
        );
        return JSON.stringify(result);
      }
      case "cancelar_turno": {
        const result = await cancelarTurno(
          String(input.turno_id),
          ctx.businessId,
          (input.motivo as string) || undefined
        );
        return JSON.stringify(result);
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
