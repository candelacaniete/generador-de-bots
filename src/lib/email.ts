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

export async function sendMagicLinkEmail(params: {
  to: string;
  loginUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) {
    return {
      ok: false,
      error:
        "Falta resend_api_key. Sin eso no podemos mandar el magic link desde el server.",
    };
  }

  try {
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to: params.to,
      subject: "Tu link para ingresar al panel",
      text: `Hola,

Para ingresar al panel, abrí este link (válido por un rato):

${params.loginUrl}

Si no pediste acceso, ignorá este mail.
`,
      html: `<p>Hola,</p>
<p>Para ingresar al panel, abrí este link:</p>
<p><a href="${params.loginUrl}">Ingresar al panel</a></p>
<p style="color:#64748b;font-size:12px">Si no pediste acceso, ignorá este mail.</p>`,
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error enviando email",
    };
  }
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
