import { getSupabase } from "@/lib/supabase";
import { calendarClientFromRefreshToken } from "@/lib/google-oauth";
import {
  DEFAULT_HORARIO,
  formatSlotLabel,
  generateCandidateSlots,
  overlaps,
  type HorarioLaboral,
} from "@/lib/schedule";

export type CalendarConfig = {
  business_id: string;
  google_calendar_id: string;
  google_refresh_token: string | null;
  google_account_email: string | null;
  horario_laboral: HorarioLaboral;
  duracion_default_minutos: number;
  slot_interval_minutos: number;
  dias_hacia_adelante: number;
  minutos_expiracion_pendiente: number;
};

export type ServiceRow = {
  id: string;
  business_id: string;
  nombre: string;
  duracion_minutos: number;
  requiere_derivacion_humana: boolean;
  activo: boolean;
};

export type SlotOffer = {
  start: string;
  end: string;
  label: string;
};

export async function getCalendarConfig(
  businessId: string
): Promise<CalendarConfig | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("business_calendar_config")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    ...data,
    horario_laboral: {
      ...DEFAULT_HORARIO,
      ...(data.horario_laboral as Partial<HorarioLaboral>),
    },
  } as CalendarConfig;
}

export async function listActiveServices(
  businessId: string
): Promise<ServiceRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("business_id", businessId)
    .eq("activo", true)
    .order("nombre");

  if (error) throw new Error(error.message);
  return (data as ServiceRow[]) ?? [];
}

export async function consultarDisponibilidad(params: {
  businessId: string;
  serviceId?: string | null;
  fechaDesde?: string | null;
  ventanaDias?: number;
  cantidad?: number;
}): Promise<{
  slots: SlotOffer[];
  proximo?: SlotOffer | null;
  timezone: string;
  mensaje: string;
}> {
  const config = await getCalendarConfig(params.businessId);
  if (!config?.google_refresh_token) {
    return {
      slots: [],
      proximo: null,
      timezone: DEFAULT_HORARIO.timezone,
      mensaje:
        "La agenda aún no está conectada a Google Calendar. Derivá al humano.",
    };
  }

  let duration = config.duracion_default_minutos;
  if (params.serviceId) {
    const services = await listActiveServices(params.businessId);
    const svc = services.find((s) => s.id === params.serviceId);
    if (svc) duration = svc.duracion_minutos;
  }

  const timezone = config.horario_laboral.timezone;
  const now = new Date();
  const from = params.fechaDesde ? new Date(params.fechaDesde) : now;
  if (from < now) from.setTime(now.getTime());

  // Buffer mínimo 30 min desde ahora
  const minStart = new Date(now.getTime() + 30 * 60 * 1000);
  if (from < minStart) from.setTime(minStart.getTime());

  const ventanaPrimaria = Math.min(params.ventanaDias ?? 7, config.dias_hacia_adelante);
  const toPrimary = new Date(from.getTime() + ventanaPrimaria * 24 * 60 * 60 * 1000);
  const toFull = new Date(
    from.getTime() + config.dias_hacia_adelante * 24 * 60 * 60 * 1000
  );

  const calendar = calendarClientFromRefreshToken(config.google_refresh_token);
  const calendarId = config.google_calendar_id || "primary";

  const busy = await fetchBusyPeriods(
    calendar,
    calendarId,
    from,
    toFull
  );

  const dbBusy = await fetchDbBusyPeriods(params.businessId, from, toFull);

  const allBusy = [...busy, ...dbBusy];

  const candidatesPrimary = generateCandidateSlots({
    from,
    to: toPrimary,
    durationMinutes: duration,
    intervalMinutes: config.slot_interval_minutos,
    horario: config.horario_laboral,
  });

  const freePrimary = filterFree(candidatesPrimary, duration, allBusy);
  const cantidad = params.cantidad ?? 4;
  const slots = freePrimary.slice(0, cantidad).map((start) => toOffer(start, duration, timezone));

  if (slots.length > 0) {
    return {
      slots,
      proximo: null,
      timezone,
      mensaje: `Hay ${slots.length} horario(s) disponible(s) en los próximos ${ventanaPrimaria} días.`,
    };
  }

  // Buscar próximo en el resto de la ventana
  const candidatesFull = generateCandidateSlots({
    from: toPrimary,
    to: toFull,
    durationMinutes: duration,
    intervalMinutes: config.slot_interval_minutos,
    horario: config.horario_laboral,
  });
  const freeFull = filterFree(candidatesFull, duration, allBusy);
  const proximo = freeFull[0]
    ? toOffer(freeFull[0], duration, timezone)
    : null;

  if (proximo) {
    return {
      slots: [proximo],
      proximo,
      timezone,
      mensaje: `No hay turnos en los próximos ${ventanaPrimaria} días. El próximo disponible es: ${proximo.label}.`,
    };
  }

  return {
    slots: [],
    proximo: null,
    timezone,
    mensaje: `No hay disponibilidad en los próximos ${config.dias_hacia_adelante} días. Pedí nombre y teléfono y derivá a un humano.`,
  };
}

function toOffer(start: Date, durationMinutes: number, timezone: string): SlotOffer {
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label: formatSlotLabel(start.toISOString(), timezone),
  };
}

function filterFree(
  candidates: Date[],
  durationMinutes: number,
  busy: { start: Date; end: Date }[]
): Date[] {
  return candidates.filter((start) => {
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    return !busy.some((b) => overlaps(start, end, b.start, b.end));
  });
}

async function fetchBusyPeriods(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calendar: any,
  calendarId: string,
  from: Date,
  to: Date
): Promise<{ start: Date; end: Date }[]> {
  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      items: [{ id: calendarId }],
    },
  });

  const periods = data.calendars?.[calendarId]?.busy ?? [];
  return periods
    .filter((p: { start?: string; end?: string }) => p.start && p.end)
    .map((p: { start: string; end: string }) => ({
      start: new Date(p.start),
      end: new Date(p.end),
    }));
}

async function fetchDbBusyPeriods(
  businessId: string,
  from: Date,
  to: Date
): Promise<{ start: Date; end: Date }[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bookings")
    .select("fecha_hora, duracion_minutos")
    .eq("business_id", businessId)
    .in("estado", ["pendiente", "confirmado"])
    .gte("fecha_hora", from.toISOString())
    .lte("fecha_hora", to.toISOString());

  if (error) throw new Error(error.message);

  return (data ?? []).map((b) => {
    const start = new Date(b.fecha_hora);
    const end = new Date(start.getTime() + b.duracion_minutos * 60 * 1000);
    return { start, end };
  });
}

export async function crearTurno(params: {
  businessId: string;
  serviceId?: string | null;
  servicio: string;
  fechaHoraIso: string;
  duracionMinutos: number;
  nombreCliente: string;
  telefonoCliente: string;
  emailCliente?: string | null;
  conversationId?: string | null;
  notas?: string | null;
}): Promise<{
  bookingId: string;
  googleEventId: string | null;
  expiresAt: string;
  estado: string;
}> {
  const config = await getCalendarConfig(params.businessId);
  if (!config?.google_refresh_token) {
    throw new Error("Google Calendar no está conectado para este negocio");
  }

  const supabase = getSupabase();
  const start = new Date(params.fechaHoraIso);
  const end = new Date(start.getTime() + params.duracionMinutos * 60 * 1000);
  const expiresAt = new Date(
    Date.now() + config.minutos_expiracion_pendiente * 60 * 1000
  );

  const calendar = calendarClientFromRefreshToken(config.google_refresh_token);
  const calendarId = config.google_calendar_id || "primary";

  const summary = `PENDIENTE — ${params.servicio} — ${params.nombreCliente}`;
  const description = [
    "Estado: PENDIENTE DE CONFIRMACIÓN / PAGO DE SEÑA",
    `Cliente: ${params.nombreCliente}`,
    `Teléfono: ${params.telefonoCliente}`,
    params.emailCliente ? `Email: ${params.emailCliente}` : null,
    params.notas ? `Notas: ${params.notas}` : null,
    "Este turno se liberará automáticamente si no se confirma a tiempo.",
  ]
    .filter(Boolean)
    .join("\n");

  const event = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary,
      description,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      extendedProperties: {
        private: {
          estado: "pendiente",
          business_id: params.businessId,
        },
      },
    },
  });

  const googleEventId = event.data.id ?? null;

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      business_id: params.businessId,
      service_id: params.serviceId ?? null,
      servicio: params.servicio,
      fecha_hora: start.toISOString(),
      duracion_minutos: params.duracionMinutos,
      estado: "pendiente",
      nombre_cliente: params.nombreCliente,
      telefono_cliente: params.telefonoCliente,
      email_cliente: params.emailCliente ?? null,
      notas: params.notas ?? null,
      google_event_id: googleEventId,
      conversation_id: params.conversationId ?? null,
      expires_at: expiresAt.toISOString(),
    })
    .select("id, estado, expires_at")
    .single();

  if (error || !booking) {
    // rollback evento si falló el insert
    if (googleEventId) {
      try {
        await calendar.events.delete({ calendarId, eventId: googleEventId });
      } catch {
        /* ignore */
      }
    }
    throw new Error(error?.message ?? "No se pudo crear el turno");
  }

  return {
    bookingId: booking.id,
    googleEventId,
    expiresAt: booking.expires_at,
    estado: booking.estado,
  };
}

export async function confirmarTurno(bookingId: string, businessId: string) {
  const supabase = getSupabase();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!booking) throw new Error("Turno no encontrado");
  if (booking.estado !== "pendiente") {
    throw new Error(`El turno ya está en estado ${booking.estado}`);
  }

  const config = await getCalendarConfig(businessId);
  if (config?.google_refresh_token && booking.google_event_id) {
    const calendar = calendarClientFromRefreshToken(config.google_refresh_token);
    const calendarId = config.google_calendar_id || "primary";
    await calendar.events.patch({
      calendarId,
      eventId: booking.google_event_id,
      requestBody: {
        summary: `CONFIRMADO — ${booking.servicio} — ${booking.nombre_cliente}`,
        description: `Estado: CONFIRMADO\nCliente: ${booking.nombre_cliente}\nTeléfono: ${booking.telefono_cliente}`,
        extendedProperties: {
          private: { estado: "confirmado", business_id: businessId },
        },
      },
    });
  }

  const { error: updErr } = await supabase
    .from("bookings")
    .update({
      estado: "confirmado",
      updated_at: new Date().toISOString(),
      expires_at: null,
    })
    .eq("id", bookingId);

  if (updErr) throw new Error(updErr.message);
  return { ok: true, estado: "confirmado" };
}

export async function cancelarTurno(
  bookingId: string,
  businessId: string,
  motivo?: string
) {
  const supabase = getSupabase();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!booking) throw new Error("Turno no encontrado");

  const config = await getCalendarConfig(businessId);
  if (config?.google_refresh_token && booking.google_event_id) {
    const calendar = calendarClientFromRefreshToken(config.google_refresh_token);
    const calendarId = config.google_calendar_id || "primary";
    try {
      await calendar.events.delete({
        calendarId,
        eventId: booking.google_event_id,
      });
    } catch {
      // si ya no existe, seguimos
    }
  }

  const { error: updErr } = await supabase
    .from("bookings")
    .update({
      estado: "cancelado",
      notas: [booking.notas, motivo ? `Cancelado: ${motivo}` : null]
        .filter(Boolean)
        .join("\n"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  if (updErr) throw new Error(updErr.message);
  return { ok: true, estado: "cancelado" };
}

export async function expirarTurnosPendientes(): Promise<number> {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data: expired, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("estado", "pendiente")
    .lt("expires_at", now);

  if (error) throw new Error(error.message);
  if (!expired?.length) return 0;

  let count = 0;
  for (const booking of expired) {
    try {
      const config = await getCalendarConfig(booking.business_id);
      if (config?.google_refresh_token && booking.google_event_id) {
        const calendar = calendarClientFromRefreshToken(
          config.google_refresh_token
        );
        try {
          await calendar.events.delete({
            calendarId: config.google_calendar_id || "primary",
            eventId: booking.google_event_id,
          });
        } catch {
          /* ignore */
        }
      }

      await supabase
        .from("bookings")
        .update({
          estado: "expirado",
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking.id);

      count += 1;
    } catch (err) {
      console.error("[expire]", booking.id, err);
    }
  }

  return count;
}
