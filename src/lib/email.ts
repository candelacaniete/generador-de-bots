import { Resend } from "resend";
import { env } from "@/lib/env";
import { getSupabase } from "@/lib/supabase";

function getResend(): Resend | null {
  const key = env("RESEND_API_KEY");
  if (!key) return null;
  return new Resend(key);
}

function fromAddress(): string {
  return env("RESEND_FROM") || "Turnos <onboarding@resend.dev>";
}

export async function sendBookingConfirmedEmails(bookingId: string) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY no configurada — se omite el envío");
    return;
  }

  const supabase = getSupabase();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, servicio, fecha_hora, nombre_cliente, telefono_cliente, email_cliente, business_id"
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return;

  const { data: business } = await supabase
    .from("businesses")
    .select("nombre, email_notificaciones, owner_email")
    .eq("id", booking.business_id)
    .maybeSingle();

  if (!business) return;

  const when = new Date(booking.fecha_hora).toLocaleString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  const negocioTo =
    business.email_notificaciones?.trim() || business.owner_email?.trim();

  const jobs: Promise<unknown>[] = [];

  if (negocioTo) {
    jobs.push(
      resend.emails.send({
        from: fromAddress(),
        to: negocioTo,
        subject: `Turno confirmado — ${booking.nombre_cliente}`,
        text: `Se confirmó un turno en ${business.nombre}.

Servicio: ${booking.servicio}
Fecha: ${when}
Cliente: ${booking.nombre_cliente}
Teléfono: ${booking.telefono_cliente}
Email: ${booking.email_cliente || "—"}
ID: ${booking.id}
`,
      })
    );
  }

  if (booking.email_cliente?.trim()) {
    jobs.push(
      resend.emails.send({
        from: fromAddress(),
        to: booking.email_cliente.trim(),
        subject: `Tu turno en ${business.nombre} está confirmado`,
        text: `Hola ${booking.nombre_cliente},

Tu turno quedó confirmado.

Servicio: ${booking.servicio}
Fecha: ${when}
Negocio: ${business.nombre}

¡Te esperamos!
`,
      })
    );
  }

  const results = await Promise.allSettled(jobs);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("[email]", r.reason);
    }
  }
}
