"use client";

import { useCallback, useEffect, useState } from "react";

type Booking = {
  id: string;
  servicio: string;
  fecha_hora: string;
  estado: string;
  nombre_cliente: string;
  telefono_cliente: string;
  email_cliente: string | null;
  expires_at: string | null;
  notas: string | null;
};

const FILTERS = ["pendiente", "confirmado", "cancelado", "expirado", "todos"] as const;

export default function TurnosBoard({ businessId }: { businessId: string }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] =
    useState<(typeof FILTERS)[number]>("pendiente");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings?business_id=${businessId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar turnos");
      setBookings(data.bookings || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function bookingAction(
    bookingId: string,
    action: "confirmar" | "cancelar"
  ) {
    setBusyId(bookingId);
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
    } finally {
      setBusyId(null);
    }
  }

  const visible =
    filter === "todos"
      ? bookings
      : bookings.filter((b) => b.estado === filter);

  const counts = {
    pendiente: bookings.filter((b) => b.estado === "pendiente").length,
    confirmado: bookings.filter((b) => b.estado === "confirmado").length,
    cancelado: bookings.filter((b) => b.estado === "cancelado").length,
    expirado: bookings.filter((b) => b.estado === "expirado").length,
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Turnos</h2>
          <p className="text-sm text-slate-600">
            Confirmá o cancelá reservas pendientes.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
        >
          Actualizar
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
              filter === f
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            {f}
            {f !== "todos" ? ` (${counts[f as keyof typeof counts] ?? 0})` : ""}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Cargando turnos…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
          No hay turnos en este filtro.
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((b) => (
            <article
              key={b.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {b.servicio}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {new Date(b.fecha_hora).toLocaleString("es-AR", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    {b.nombre_cliente}
                    <br />
                    <a
                      className="text-blue-600"
                      href={`https://wa.me/${b.telefono_cliente.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {b.telefono_cliente}
                    </a>
                    {b.email_cliente ? (
                      <>
                        <br />
                        <span className="text-xs">{b.email_cliente}</span>
                      </>
                    ) : null}
                  </p>
                  <span
                    className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                      b.estado === "pendiente"
                        ? "bg-amber-100 text-amber-800"
                        : b.estado === "confirmado"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {b.estado}
                  </span>
                </div>

                {b.estado === "pendiente" ? (
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <button
                      type="button"
                      disabled={busyId === b.id}
                      onClick={() => bookingAction(b.id, "confirmar")}
                      className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      Confirmar
                    </button>
                    <button
                      type="button"
                      disabled={busyId === b.id}
                      onClick={() => bookingAction(b.id, "cancelar")}
                      className="rounded-xl bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
