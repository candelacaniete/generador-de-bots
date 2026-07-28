"use client";

import { FormEvent, useEffect, useState } from "react";

type Service = {
  id?: string;
  nombre: string;
  duracion_minutos: number;
  requiere_derivacion_humana?: boolean;
  activo?: boolean;
};

type Booking = {
  id: string;
  servicio: string;
  fecha_hora: string;
  estado: string;
  nombre_cliente: string;
  telefono_cliente: string;
  email_cliente: string | null;
  expires_at: string | null;
};

type AgendaPanelProps = {
  businessId: string;
  calendarStatus?: string | null;
  /** Si true, no muestra la lista de turnos (van al panel dedicado). */
  hideBookings?: boolean;
};

export default function AgendaPanel({
  businessId,
  calendarStatus,
  hideBookings = false,
}: AgendaPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [agendaHabilitada, setAgendaHabilitada] = useState(false);
  const [requiereSeña, setRequiereSeña] = useState(false);
  const [aliasCbu, setAliasCbu] = useState("");
  const [instruccionesSeña, setInstruccionesSeña] = useState("");
  const [conectado, setConectado] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [duracionDefault, setDuracionDefault] = useState(30);
  const [colorPrimario, setColorPrimario] = useState("#2563eb");
  const [emailNotificaciones, setEmailNotificaciones] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [services, setServices] = useState<Service[]>([
    { nombre: "Consulta", duracion_minutos: 30 },
  ]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const requests: Promise<Response>[] = [
        fetch(`/api/agenda/config?business_id=${businessId}`),
      ];
      if (!hideBookings) {
        requests.push(fetch(`/api/bookings?business_id=${businessId}`));
      }
      const [cfgRes, bookRes] = await Promise.all(requests);
      const cfg = await cfgRes.json();
      if (!cfgRes.ok) throw new Error(cfg.error || "Error al cargar config");

      setAgendaHabilitada(Boolean(cfg.business.agenda_habilitada));
      setRequiereSeña(Boolean(cfg.business.requiere_sena));
      setAliasCbu(cfg.business.alias_cbu || "");
      setInstruccionesSeña(cfg.business.instrucciones_sena || "");
      setColorPrimario(cfg.business.color_primario || "#2563eb");
      setEmailNotificaciones(cfg.business.email_notificaciones || "");
      setOwnerEmail(cfg.business.owner_email || "");
      setConectado(Boolean(cfg.config.conectado));
      setGoogleEmail(cfg.config.google_account_email);
      setDuracionDefault(cfg.config.duracion_default_minutos || 30);
      setServices(
        (cfg.services?.length
          ? cfg.services
          : [{ nombre: "Consulta", duracion_minutos: 30 }]) as Service[]
      );

      if (!hideBookings && bookRes) {
        const books = await bookRes.json();
        if (!bookRes.ok) throw new Error(books.error || "Error al cargar turnos");
        setBookings(books.bookings || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/agenda/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: businessId,
          agenda_habilitada: agendaHabilitada,
          requiere_sena: requiereSeña,
          alias_cbu: aliasCbu,
          instrucciones_sena: instruccionesSeña,
          color_primario: colorPrimario,
          email_notificaciones: emailNotificaciones,
          owner_email: ownerEmail,
          config: {
            duracion_default_minutos: duracionDefault,
          },
          services,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar");
      setOkMsg("Configuración guardada");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function bookingAction(bookingId: string, action: "confirmar" | "cancelar") {
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: businessId,
          booking_id: bookingId,
          action,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  if (loading) {
    return (
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Cargando agenda…
      </section>
    );
  }

  return (
    <section className="mt-6 space-y-6">
      {calendarStatus === "connected" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Google Calendar conectado correctamente.
        </p>
      ) : null}
      {calendarStatus === "error" || calendarStatus === "missing_refresh" ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No se pudo completar OAuth. Volvé a conectar y asegurate de aceptar
          todos los permisos (hace falta el refresh token).
        </p>
      ) : null}

      <form
        onSubmit={onSave}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-slate-900">
          Configuración de agenda
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Conectá Google Calendar, definí servicios y seña manual.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            href={`/api/google/oauth/start?business_id=${businessId}`}
            className="inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {conectado ? "Reconectar Google Calendar" : "Conectar Google Calendar"}
          </a>
          <span className="text-xs text-slate-500">
            {conectado
              ? `Conectado${googleEmail ? `: ${googleEmail}` : ""}`
              : "Sin conectar"}
          </span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={agendaHabilitada}
              onChange={(e) => setAgendaHabilitada(e.target.checked)}
            />
            Agenda habilitada en el bot
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={requiereSeña}
              onChange={(e) => setRequiereSeña(e.target.checked)}
            />
            Requiere seña manual
          </label>
        </div>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">
            Duración default (min)
          </span>
          <input
            type="number"
            min={5}
            value={duracionDefault}
            onChange={(e) => setDuracionDefault(Number(e.target.value) || 30)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">
            Color del bot (hex)
          </span>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={colorPrimario}
              onChange={(e) => setColorPrimario(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded border border-slate-300 bg-white p-1"
            />
            <input
              value={colorPrimario}
              onChange={(e) => setColorPrimario(e.target.value)}
              placeholder="#2563eb"
              pattern="^#[0-9A-Fa-f]{6}$"
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>
        </label>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">
            Email para avisos de turnos confirmados
          </span>
          <input
            type="email"
            value={emailNotificaciones}
            onChange={(e) => setEmailNotificaciones(e.target.value)}
            placeholder="turnos@negocio.com"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">
            Email de acceso al panel (owner)
          </span>
          <input
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            placeholder="dueño@negocio.com"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <span className="text-xs text-slate-500">
            Ese email puede entrar con magic link a este panel.
          </span>
        </label>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">Alias / CBU</span>
          <input
            value={aliasCbu}
            onChange={(e) => setAliasCbu(e.target.value)}
            placeholder="alias.negocio o CBU"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">
            Instrucciones de seña
          </span>
          <textarea
            value={instruccionesSeña}
            onChange={(e) => setInstruccionesSeña(e.target.value)}
            rows={3}
            placeholder="Ej. Transferí $10.000 al alias y enviá el comprobante por WhatsApp."
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Servicios</h3>
            <button
              type="button"
              className="text-xs font-medium text-blue-600"
              onClick={() =>
                setServices((prev) => [
                  ...prev,
                  { nombre: "", duracion_minutos: duracionDefault },
                ])
              }
            >
              + Agregar
            </button>
          </div>
          <div className="space-y-2">
            {services.map((svc, idx) => (
              <div key={svc.id || idx} className="grid gap-2 sm:grid-cols-12">
                <input
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm sm:col-span-5"
                  placeholder="Nombre"
                  value={svc.nombre}
                  onChange={(e) => {
                    const v = e.target.value;
                    setServices((prev) =>
                      prev.map((s, i) => (i === idx ? { ...s, nombre: v } : s))
                    );
                  }}
                />
                <input
                  type="number"
                  min={5}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
                  value={svc.duracion_minutos}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 30;
                    setServices((prev) =>
                      prev.map((s, i) =>
                        i === idx ? { ...s, duracion_minutos: v } : s
                      )
                    );
                  }}
                />
                <label className="flex items-center gap-2 text-xs text-slate-600 sm:col-span-4">
                  <input
                    type="checkbox"
                    checked={Boolean(svc.requiere_derivacion_humana)}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setServices((prev) =>
                        prev.map((s, i) =>
                          i === idx
                            ? { ...s, requiere_derivacion_humana: v }
                            : s
                        )
                      );
                    }}
                  />
                  Requiere humano
                </label>
                <button
                  type="button"
                  className="text-xs text-red-600 sm:col-span-1"
                  onClick={() =>
                    setServices((prev) => prev.filter((_, i) => i !== idx))
                  }
                >
                  X
                </button>
              </div>
            ))}
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {okMsg ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {okMsg}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="mt-5 inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar configuración"}
        </button>
      </form>

      {!hideBookings ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Turnos recientes</h2>
          <div className="mt-3 space-y-3">
            {bookings.length === 0 ? (
              <p className="text-sm text-slate-500">Todavía no hay turnos.</p>
            ) : (
              bookings.map((b) => (
                <div
                  key={b.id}
                  className="rounded-xl border border-slate-200 px-3 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">
                        {b.servicio} · {b.estado}
                      </p>
                      <p className="text-slate-600">
                        {new Date(b.fecha_hora).toLocaleString("es-AR")} —{" "}
                        {b.nombre_cliente} · {b.telefono_cliente}
                      </p>
                    </div>
                    {b.estado === "pendiente" ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => bookingAction(b.id, "confirmar")}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => bookingAction(b.id, "cancelar")}
                          className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
