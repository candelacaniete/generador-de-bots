import type Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "@/lib/supabase";
import {
  confirmarTurno,
  consultarDisponibilidad,
  cancelarTurno,
  crearTurno,
  listActiveServices,
} from "@/lib/bookings";

export const BOOKING_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "listar_servicios",
    description:
      "Lista los servicios activos del negocio que se pueden reservar.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "consultar_disponibilidad",
    description:
      "Consulta horarios libres reales en Google Calendar. Devolvés opciones concretas; nunca inventes horarios.",
    input_schema: {
      type: "object",
      properties: {
        service_id: {
          type: "string",
          description: "ID del servicio (opcional si hay uno solo)",
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
      "Crea un turno pendiente, bloquea el slot en Google Calendar. Teléfono obligatorio, email opcional.",
    input_schema: {
      type: "object",
      properties: {
        service_id: { type: "string" },
        servicio: { type: "string" },
        fecha_hora: {
          type: "string",
          description: "ISO datetime del inicio del turno elegido",
        },
        duracion_minutos: { type: "number" },
        nombre_cliente: { type: "string" },
        telefono_cliente: { type: "string" },
        email_cliente: { type: "string" },
        notas: { type: "string" },
      },
      required: ["servicio", "fecha_hora", "nombre_cliente", "telefono_cliente"],
      additionalProperties: false,
    },
  },
  {
    name: "obtener_info_sena",
    description:
      "Obtiene alias/CBU e instrucciones de seña del negocio, si requiere seña.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "derivar_a_humano",
    description:
      "Guarda los datos del cliente para seguimiento manual (sin slots, obra social, o servicio que requiere derivación).",
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
    description: "Confirma un turno pendiente (uso interno / si el negocio lo indica).",
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

export async function runBookingTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  try {
    switch (name) {
      case "listar_servicios": {
        const services = await listActiveServices(ctx.businessId);
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
        return JSON.stringify(result);
      }
      case "crear_turno": {
        const services = await listActiveServices(ctx.businessId);
        const serviceId = (input.service_id as string) || null;
        const svc = serviceId
          ? services.find((s) => s.id === serviceId)
          : services.length === 1
            ? services[0]
            : null;

        if (svc?.requiere_derivacion_humana) {
          return JSON.stringify({
            error:
              "Este servicio requiere derivación humana. No crear turno automático.",
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
          fechaHoraIso: String(input.fecha_hora),
          duracionMinutos: duracion,
          nombreCliente: String(input.nombre_cliente),
          telefonoCliente: String(input.telefono_cliente),
          emailCliente: (input.email_cliente as string) || null,
          conversationId: ctx.conversationId,
          notas: (input.notas as string) || null,
        });

        return JSON.stringify({
          ok: true,
          ...created,
          aviso:
            "Turno creado en estado pendiente. Informá al usuario cómo confirmar (seña o contacto del negocio).",
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
        const supabase = getSupabase();
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
          const { data: conv } = await supabase
            .from("conversations")
            .select("estado_flujo")
            .eq("id", ctx.conversationId)
            .maybeSingle();

          await supabase
            .from("conversations")
            .update({
              estado_flujo: {
                ...((conv?.estado_flujo as object) || {}),
                lead,
              },
              actualizado_en: new Date().toISOString(),
            })
            .eq("id", ctx.conversationId)
            .eq("business_id", ctx.businessId);
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
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Error en la tool",
    });
  }
}
