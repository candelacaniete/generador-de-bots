import {
  consultarDiasDisponibles,
  consultarHorariosDia,
  crearTurno,
  listActiveServices,
  type DayOffer,
  type SlotOffer,
} from "@/lib/bookings";
import {
  getConversationFlow,
  patchConversationFlow,
} from "@/lib/conversations";
import { getSupabase } from "@/lib/supabase";

export type BookingStep =
  | "idle"
  | "pick_service"
  | "pick_day"
  | "pick_time"
  | "ask_contact"
  | "confirm_summary"
  | "done";

type FlowState = {
  booking_step?: BookingStep;
  selected_service_id?: string | null;
  selected_service_nombre?: string | null;
  selected_fecha?: string | null;
  last_dias?: DayOffer[];
  last_slots?: SlotOffer[];
  day_slots_offset?: number;
  day_slots_has_more?: boolean;
  day_slots_total?: number;
  selected_slot?: string | null;
  selected_slot_label?: string | null;
  last_booking_id?: string | null;
  needs_human?: boolean;
  service_duration?: number;
  lead?: {
    nombre_cliente?: string;
    telefono_cliente?: string;
    email_cliente?: string | null;
  };
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function wantsBooking(msg: string): boolean {
  return /(turno|reserv|agend|cita|horario)/i.test(msg);
}

function wantsMoreTimes(msg: string): boolean {
  return /(mas horario|más horario|otros horario|otra opcion|otra opción|ver mas|ver más|mostrame mas|mostrame más|no me sirve|ninguno)/i.test(
    msg
  );
}

function wantsCancelFlow(msg: string): boolean {
  return /(cancelar|olvidate|olvidá|no quiero|dejalo|dejá|salir)/i.test(msg);
}

function wantsYes(msg: string): boolean {
  return /^(si|sí|ok|dale|confirmo|correcto|esta bien|está bien|todo bien|perfecto|yes)\b/i.test(
    msg.trim()
  );
}

function wantsNo(msg: string): boolean {
  return /^(no|mal|incorrecto|cambiar|corregir|editar)\b/i.test(msg.trim());
}

function parsePhone(msg: string): string | null {
  const m = msg.match(/(?:\+?\d[\d\s\-()]{7,}\d)/);
  return m ? m[0].replace(/[^\d+]/g, "") : null;
}

function parseEmail(msg: string): string | null {
  const m = msg.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0] : null;
}

function parseName(msg: string, phone: string | null, email: string | null): string {
  let nombre = msg;
  if (phone) nombre = nombre.replace(phone, " ");
  // also remove original phone formatting variants
  nombre = nombre.replace(/(?:\+?\d[\d\s\-()]{7,}\d)/g, " ");
  if (email) nombre = nombre.replace(email, " ");
  nombre = nombre
    .replace(/[,;|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return nombre.length >= 2 ? nombre : "Cliente";
}

function matchService(
  msg: string,
  services: { id: string; nombre: string }[]
): { id: string; nombre: string } | null {
  const n = norm(msg);
  const exact = services.find((s) => norm(s.nombre) === n);
  if (exact) return exact;
  const partial = services.find(
    (s) => n.includes(norm(s.nombre)) || norm(s.nombre).includes(n)
  );
  return partial ?? null;
}

function matchDay(msg: string, days: DayOffer[]): DayOffer | null {
  const n = norm(msg);
  // YYYY-MM-DD
  const iso = msg.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) {
    return days.find((d) => d.fecha === iso[1]) ?? null;
  }
  // index 1-based
  const num = msg.match(/^\s*(\d{1,2})\s*$/);
  if (num) {
    const idx = Number(num[1]) - 1;
    if (idx >= 0 && idx < days.length) return days[idx];
  }
  // weekday / label fragments
  for (const d of days) {
    if (norm(d.label).includes(n) || n.includes(norm(d.label))) return d;
  }
  // "martes", "28"
  for (const d of days) {
    const parts = norm(d.label).split(/\s+/);
    if (parts.some((p) => p === n || (n.length > 2 && p.includes(n)))) return d;
  }
  const dayNum = msg.match(/\b(\d{1,2})\b/);
  if (dayNum) {
    const hit = days.find((d) => d.fecha.endsWith(`-${dayNum[1].padStart(2, "0")}`) || d.label.includes(dayNum[1]));
    if (hit) return hit;
  }
  return null;
}

function matchSlot(msg: string, slots: SlotOffer[]): SlotOffer | null {
  const num = msg.match(/^\s*(\d{1,2})\s*$/);
  if (num) {
    const idx = Number(num[1]) - 1;
    if (idx >= 0 && idx < slots.length) return slots[idx];
  }
  const hm = msg.match(/\b(\d{1,2}):(\d{2})\b/);
  if (hm) {
    const h = Number(hm[1]);
    const m = hm[2];
    const variants = [
      `${String(h).padStart(2, "0")}:${m}`,
      `${h}:${m}`,
    ];
    for (const v of variants) {
      const hit = slots.find(
        (s) => s.label.includes(v) || s.start.includes(`T${String(h).padStart(2, "0")}:${m}`)
      );
      if (hit) return hit;
    }
  }
  const n = norm(msg);
  return slots.find((s) => norm(s.label).includes(n)) ?? null;
}

function formatDays(dias: DayOffer[]): string {
  return dias
    .map((d, i) => `${i + 1}. ${d.label} (${d.slots_libres} horarios libres)`)
    .join("\n");
}

function formatSlots(slots: SlotOffer[]): string {
  return slots.map((s, i) => `${i + 1}. ${s.label}`).join("\n");
}

export async function handleBookingOrchestrator(params: {
  businessId: string;
  conversationId: string;
  mensaje: string;
  requiereSena: boolean;
}): Promise<{ handled: boolean; respuesta?: string }> {
  const { businessId, conversationId, mensaje, requiereSena } = params;
  const flow = (await getConversationFlow(
    conversationId,
    businessId
  )) as FlowState;

  let step: BookingStep = flow.booking_step || "idle";

  if (step === "idle" && !wantsBooking(mensaje)) {
    return { handled: false };
  }

  if (wantsCancelFlow(mensaje) && step !== "idle") {
    await patchConversationFlow(conversationId, businessId, {
      booking_step: "idle",
      selected_slot: null,
      last_slots: [],
      last_dias: [],
    });
    return {
      handled: true,
      respuesta:
        "Listo, cancelé el flujo de reserva. Si querés retomar, pedime un turno cuando quieras.",
    };
  }

  const services = await listActiveServices(businessId);
  const bookable = services.filter((s) => !s.requiere_derivacion_humana);

  // ---- idle → start ----
  if (step === "idle") {
    if (bookable.length === 0) {
      if (services.some((s) => s.requiere_derivacion_humana)) {
        await patchConversationFlow(conversationId, businessId, {
          booking_step: "ask_contact",
          selected_service_nombre: services[0]?.nombre,
          needs_human: true,
        });
        return {
          handled: true,
          respuesta:
            "Ese tipo de atención requiere que te contacte el equipo. Pasame tu nombre y teléfono y los derivo.",
        };
      }
      return {
        handled: true,
        respuesta:
          "Todavía no hay servicios cargados para reservar. El negocio tiene que configurarlos en la agenda.",
      };
    }

    if (bookable.length === 1) {
      const svc = bookable[0];
      return await goToDays({
        businessId,
        conversationId,
        serviceId: svc.id,
        serviceNombre: svc.nombre,
        intro: `Perfecto. Vamos a reservar **${svc.nombre}** (${svc.duracion_minutos} min).\n\n`,
      });
    }

    await patchConversationFlow(conversationId, businessId, {
      booking_step: "pick_service",
      servicios: bookable.map((s) => ({
        id: s.id,
        nombre: s.nombre,
        duracion_minutos: s.duracion_minutos,
      })),
    });

    const list = bookable
      .map((s, i) => `${i + 1}. ${s.nombre} (${s.duracion_minutos} min)`)
      .join("\n");
    return {
      handled: true,
      respuesta: `¡Dale! ¿Qué servicio querés reservar?\n\n${list}\n\nPodés responder con el número o el nombre.`,
    };
  }

  // ---- pick_service ----
  if (step === "pick_service") {
    const byIndex = mensaje.match(/^\s*(\d{1,2})\s*$/);
    let svc =
      byIndex && bookable[Number(byIndex[1]) - 1]
        ? bookable[Number(byIndex[1]) - 1]
        : matchService(mensaje, bookable);

    if (!svc) {
      const list = bookable
        .map((s, i) => `${i + 1}. ${s.nombre}`)
        .join("\n");
      return {
        handled: true,
        respuesta: `No identifiqué el servicio. Elegí uno de la lista:\n\n${list}`,
      };
    }

    const full = services.find((s) => s.id === svc!.id)!;
    if (full.requiere_derivacion_humana) {
      await patchConversationFlow(conversationId, businessId, {
        booking_step: "ask_contact",
        selected_service_id: full.id,
        selected_service_nombre: full.nombre,
        needs_human: true,
      });
      return {
        handled: true,
        respuesta: `**${full.nombre}** requiere coordinación con el equipo. Pasame tu nombre y teléfono y te contactan.`,
      };
    }

    return await goToDays({
      businessId,
      conversationId,
      serviceId: full.id,
      serviceNombre: full.nombre,
      intro: `Genial, **${full.nombre}**.\n\n`,
    });
  }

  // ---- pick_day ----
  if (step === "pick_day") {
    const days = (flow.last_dias as DayOffer[]) || [];
    const day = matchDay(mensaje, days);
    if (!day) {
      return {
        handled: true,
        respuesta: `¿Qué día te queda mejor? Respondé con el número o el nombre del día:\n\n${formatDays(days)}`,
      };
    }
    return await goToTimes({
      businessId,
      conversationId,
      serviceId: flow.selected_service_id || null,
      fecha: day.fecha,
      offset: 0,
      intro: `Perfecto, **${day.label}**. Estos son los primeros horarios libres:\n\n`,
    });
  }

  // ---- pick_time ----
  if (step === "pick_time") {
    const slots = (flow.last_slots as SlotOffer[]) || [];

    if (wantsMoreTimes(mensaje)) {
      if (!flow.day_slots_has_more) {
        return {
          handled: true,
          respuesta: `No hay más horarios ese día. Elegí uno de estos o pedime volver a ver los días:\n\n${formatSlots(slots)}`,
        };
      }
      const nextOffset = (flow.day_slots_offset || 0) + slots.length;
      return await goToTimes({
        businessId,
        conversationId,
        serviceId: flow.selected_service_id || null,
        fecha: String(flow.selected_fecha),
        offset: nextOffset,
        intro: `Acá van más horarios:\n\n`,
      });
    }

    // "cambiar dia" / back
    if (/(otro dia|otro día|cambiar dia|cambiar día|volver)/i.test(mensaje)) {
      return await goToDays({
        businessId,
        conversationId,
        serviceId: flow.selected_service_id || null,
        serviceNombre: flow.selected_service_nombre || "el servicio",
        intro: "Dale, veamos otros días.\n\n",
      });
    }

    const slot = matchSlot(mensaje, slots);
    if (!slot) {
      const more = flow.day_slots_has_more
        ? "\n\nSi ninguno te sirve, pedime *más horarios*."
        : "";
      return {
        handled: true,
        respuesta: `Elegí un horario con el número o la hora:\n\n${formatSlots(slots)}${more}`,
      };
    }

    await patchConversationFlow(conversationId, businessId, {
      booking_step: "ask_contact",
      selected_slot: slot.start,
      selected_slot_label: slot.label,
    });

    return {
      handled: true,
      respuesta: `Quedó seleccionado: **${slot.label}**.\n\nPara bloquearlo en la agenda necesito:\n1. Nombre completo\n2. Teléfono (obligatorio)\n3. Email (opcional)\n\nPodés mandarlo todo en un solo mensaje.`,
    };
  }

  // ---- ask_contact ----
  if (step === "ask_contact") {
    const phone = parsePhone(mensaje);
    if (!phone) {
      return {
        handled: true,
        respuesta:
          "Necesito tu **teléfono** para continuar (podés pegar nombre + teléfono + email en un mensaje).",
      };
    }
    const email = parseEmail(mensaje);
    const nombre = parseName(mensaje, phone, email);

    if (flow.needs_human) {
      await patchConversationFlow(conversationId, businessId, {
        booking_step: "done",
        lead: {
          nombre_cliente: nombre,
          telefono_cliente: phone,
          email_cliente: email,
          servicio: flow.selected_service_nombre,
          motivo: "Derivación humana",
        },
      });
      return {
        handled: true,
        respuesta: `Gracias, ${nombre}. Dejé tus datos (${phone}) para que el equipo te contacte por **${flow.selected_service_nombre || "tu consulta"}**.`,
      };
    }

    if (!flow.selected_slot) {
      await patchConversationFlow(conversationId, businessId, {
        booking_step: "pick_day",
      });
      return {
        handled: true,
        respuesta:
          "Se me perdió el horario elegido. Empecemos de nuevo: pedime un turno.",
      };
    }

    await patchConversationFlow(conversationId, businessId, {
      booking_step: "confirm_summary",
      lead: {
        nombre_cliente: nombre,
        telefono_cliente: phone,
        email_cliente: email,
      },
    });

    return {
      handled: true,
      respuesta: `Perfecto, revisemos antes de bloquear el turno:

- Servicio: **${flow.selected_service_nombre}**
- Horario: **${flow.selected_slot_label}**
- Nombre: **${nombre}**
- Teléfono: **${phone}**${email ? `\n- Email: **${email}**` : ""}

¿Está todo bien así? Respondé **sí** para confirmar o **no** para corregir los datos.`,
    };
  }

  // ---- confirm_summary ----
  if (step === "confirm_summary") {
    const lead = flow.lead || {};

    if (wantsNo(mensaje)) {
      await patchConversationFlow(conversationId, businessId, {
        booking_step: "ask_contact",
        lead: {},
      });
      return {
        handled: true,
        respuesta:
          "Dale, mandame de nuevo **nombre + teléfono** (email opcional) y armamos el resumen otra vez.",
      };
    }

    // Allow inline corrections without saying "no"
    const phoneFix = parsePhone(mensaje);
    const emailFix = parseEmail(mensaje);
    if (phoneFix && !wantsYes(mensaje)) {
      const nombreFix = parseName(
        mensaje,
        phoneFix,
        emailFix || lead.email_cliente || null
      );
      const nombre =
        nombreFix !== "Cliente" ? nombreFix : lead.nombre_cliente || "Cliente";
      const email = emailFix || lead.email_cliente || null;
      await patchConversationFlow(conversationId, businessId, {
        booking_step: "confirm_summary",
        lead: {
          nombre_cliente: nombre,
          telefono_cliente: phoneFix,
          email_cliente: email,
        },
      });
      return {
        handled: true,
        respuesta: `Actualicé los datos:

- Servicio: **${flow.selected_service_nombre}**
- Horario: **${flow.selected_slot_label}**
- Nombre: **${nombre}**
- Teléfono: **${phoneFix}**${email ? `\n- Email: **${email}**` : ""}

¿Está todo bien así? Respondé **sí** o **no**.`,
      };
    }

    if (!wantsYes(mensaje)) {
      return {
        handled: true,
        respuesta:
          "¿Confirmamos el turno? Respondé **sí** para crear el turno, o **no** / mandá los datos corregidos.",
      };
    }

    const nombre = lead.nombre_cliente || "Cliente";
    const phone = lead.telefono_cliente;
    const email = lead.email_cliente || null;

    if (!phone || !flow.selected_slot) {
      await patchConversationFlow(conversationId, businessId, {
        booking_step: "ask_contact",
      });
      return {
        handled: true,
        respuesta: "Me faltan datos. Mandame nombre y teléfono otra vez.",
      };
    }

    try {
      const services = await listActiveServices(businessId);
      const svc = flow.selected_service_id
        ? services.find((s) => s.id === flow.selected_service_id)
        : null;

      const created = await crearTurno({
        businessId,
        serviceId: flow.selected_service_id || null,
        servicio: String(flow.selected_service_nombre || svc?.nombre || "Turno"),
        fechaHoraIso: String(flow.selected_slot),
        duracionMinutos:
          Number(flow.service_duration) || svc?.duracion_minutos || 30,
        nombreCliente: nombre,
        telefonoCliente: phone,
        emailCliente: email,
        conversationId,
      });

      let senaBlock = "";
      if (requiereSena) {
        const supabase = getSupabase();
        const { data: biz } = await supabase
          .from("businesses")
          .select("alias_cbu, instrucciones_sena")
          .eq("id", businessId)
          .maybeSingle();
        senaBlock = `\n\nPara confirmar (el turno queda **pendiente**):\n${
          biz?.instrucciones_sena || "Transferí la seña"
        }${biz?.alias_cbu ? `\nAlias/CBU: **${biz.alias_cbu}**` : ""}`;
      } else {
        senaBlock =
          "\n\nQuedó en estado **pendiente**: el negocio te va a confirmar.";
      }

      await patchConversationFlow(conversationId, businessId, {
        booking_step: "done",
        last_booking_id: created.bookingId,
        last_booking_estado: created.estado,
      });

      return {
        handled: true,
        respuesta: `¡Listo, ${nombre}! Turno creado y bloqueado en Google Calendar.

- Servicio: **${flow.selected_service_nombre}**
- Horario: **${flow.selected_slot_label}**
- Teléfono: ${phone}${email ? `\n- Email: ${email}` : ""}
- Estado: **pendiente**
- ID: \`${created.bookingId}\`${senaBlock}`,
      };
    } catch (err) {
      console.error("[orchestrator crearTurno]", err);
      const msg = err instanceof Error ? err.message : "error";
      if (/ocupó|ocupado/i.test(msg)) {
        await patchConversationFlow(conversationId, businessId, {
          booking_step: "pick_day",
          selected_slot: null,
          selected_slot_label: null,
        });
        return {
          handled: true,
          respuesta:
            "Uy, ese horario se acaba de ocupar. Elegí otro día/horario: pedime *turno* o decime el día de nuevo.",
        };
      }
      return {
        handled: true,
        respuesta: `Tuve un problema al crear el evento en Google Calendar: ${msg}.\n\n¿Probamos de nuevo? Decí "turno" para reiniciar.`,
      };
    }
  }

  // done / fallback → restart if they ask again
  if (step === "done" && wantsBooking(mensaje)) {
    await patchConversationFlow(conversationId, businessId, {
      booking_step: "idle",
      selected_slot: null,
      last_booking_id: null,
    });
    return handleBookingOrchestrator({
      ...params,
      mensaje: "quiero un turno",
    });
  }

  if (step === "done") {
    return { handled: false };
  }

  return { handled: false };
}

async function goToDays(params: {
  businessId: string;
  conversationId: string;
  serviceId: string | null;
  serviceNombre: string;
  intro: string;
}): Promise<{ handled: true; respuesta: string }> {
  const dias = await consultarDiasDisponibles({
    businessId: params.businessId,
    serviceId: params.serviceId,
  });

  if (!dias.dias.length) {
    await patchConversationFlow(params.conversationId, params.businessId, {
      booking_step: "ask_contact",
      selected_service_id: params.serviceId,
      selected_service_nombre: params.serviceNombre,
      needs_human: true,
    });
    return {
      handled: true,
      respuesta: `${params.intro}No hay días libres en la agenda por ahora. Pasame tu nombre y teléfono y te contacta el equipo.`,
    };
  }

  await patchConversationFlow(params.conversationId, params.businessId, {
    booking_step: "pick_day",
    selected_service_id: params.serviceId,
    selected_service_nombre: params.serviceNombre,
    last_dias: dias.dias,
    selected_slot: null,
    last_slots: [],
    needs_human: false,
  });

  return {
    handled: true,
    respuesta: `${params.intro}Estos son los días con turnos libres:\n\n${formatDays(
      dias.dias
    )}\n\n¿Qué día preferís? (número o nombre)`,
  };
}

async function goToTimes(params: {
  businessId: string;
  conversationId: string;
  serviceId: string | null;
  fecha: string;
  offset: number;
  intro: string;
}): Promise<{ handled: true; respuesta: string }> {
  // use real service duration
  let duration = 30;
  if (params.serviceId) {
    const services = await listActiveServices(params.businessId);
    const svc = services.find((s) => s.id === params.serviceId);
    if (svc) duration = svc.duracion_minutos;
  }

  const horarios = await consultarHorariosDia({
    businessId: params.businessId,
    serviceId: params.serviceId,
    fecha: params.fecha,
    offset: params.offset,
    limit: 5,
  });

  if (!horarios.slots.length) {
    return {
      handled: true,
      respuesta:
        "No quedaron horarios libres ese día. Pedime otro día de la lista.",
    };
  }

  await patchConversationFlow(params.conversationId, params.businessId, {
    booking_step: "pick_time",
    selected_fecha: params.fecha,
    last_slots: horarios.slots,
    day_slots_offset: horarios.offset,
    day_slots_has_more: horarios.has_more,
    day_slots_total: horarios.total_dia,
    service_duration: duration,
  });

  const more = horarios.has_more
    ? "\n\nSi ninguno te sirve, decime *más horarios*."
    : "";

  return {
    handled: true,
    respuesta: `${params.intro}${formatSlots(horarios.slots)}${more}\n\n¿Cuál te queda bien?`,
  };
}
