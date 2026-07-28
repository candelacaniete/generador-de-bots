"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type ServiceRow = {
  nombre: string;
  duracion_minutos: number;
  precio: string;
};

export default function OnboardingForm() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [checking, setChecking] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [horarios, setHorarios] = useState(
    "Lunes a viernes 9 a 18 hs\nSábados cerrado"
  );
  const [faq, setFaq] = useState("");
  const [aliasCbu, setAliasCbu] = useState("");
  const [instruccionesSena, setInstruccionesSena] = useState("");
  const [color, setColor] = useState("#2563eb");
  const [services, setServices] = useState<ServiceRow[]>([
    { nombre: "", duracion_minutos: 30, precio: "" },
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/onboarding/${token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Link inválido");
        if (!cancelled) setChecking(false);
      } catch (err) {
        if (!cancelled) {
          setTokenError(err instanceof Error ? err.message : "Link inválido");
          setChecking(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/onboarding/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          owner_email: ownerEmail,
          horarios,
          faq,
          alias_cbu: aliasCbu,
          instrucciones_sena: instruccionesSena,
          color_primario: color,
          services,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo enviar");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-sm text-slate-500">
        Validando link…
      </main>
    );
  }

  if (tokenError) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-xl font-semibold text-slate-900">Link no válido</h1>
        <p className="mt-2 text-sm text-slate-600">{tokenError}</p>
      </main>
    );
  }

  if (done) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-2xl font-semibold text-slate-900">¡Recibido!</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Gracias. Revisamos tu info y te contactamos para activar el bot y la
          agenda. No hace falta que hagas nada más por ahora.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Datos de tu negocio
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Completá este formulario una sola vez. Con esto armamos la base del bot.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Nombre del negocio</span>
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Tu email (acceso al panel)</span>
          <input
            type="email"
            required
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Servicios</span>
            <button
              type="button"
              className="text-xs font-semibold text-blue-600"
              onClick={() =>
                setServices((prev) => [
                  ...prev,
                  { nombre: "", duracion_minutos: 30, precio: "" },
                ])
              }
            >
              + Agregar
            </button>
          </div>
          <div className="space-y-2">
            {services.map((svc, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2">
                <input
                  required
                  placeholder="Nombre"
                  value={svc.nombre}
                  onChange={(e) => {
                    const v = e.target.value;
                    setServices((prev) =>
                      prev.map((s, i) => (i === idx ? { ...s, nombre: v } : s))
                    );
                  }}
                  className="col-span-5 rounded-xl border border-slate-300 px-2 py-2 text-sm"
                />
                <input
                  type="number"
                  min={5}
                  placeholder="Min"
                  value={svc.duracion_minutos}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 30;
                    setServices((prev) =>
                      prev.map((s, i) =>
                        i === idx ? { ...s, duracion_minutos: v } : s
                      )
                    );
                  }}
                  className="col-span-3 rounded-xl border border-slate-300 px-2 py-2 text-sm"
                />
                <input
                  placeholder="Precio"
                  value={svc.precio}
                  onChange={(e) => {
                    const v = e.target.value;
                    setServices((prev) =>
                      prev.map((s, i) => (i === idx ? { ...s, precio: v } : s))
                    );
                  }}
                  className="col-span-4 rounded-xl border border-slate-300 px-2 py-2 text-sm"
                />
              </div>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Horarios de atención</span>
          <textarea
            required
            rows={3}
            value={horarios}
            onChange={(e) => setHorarios(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">FAQ / info general</span>
          <textarea
            rows={5}
            value={faq}
            onChange={(e) => setFaq(e.target.value)}
            placeholder="Obra social, ubicación, políticas de cancelación…"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Alias / CBU (si hay seña)</span>
          <input
            value={aliasCbu}
            onChange={(e) => setAliasCbu(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Instrucciones de seña</span>
          <textarea
            rows={2}
            value={instruccionesSena}
            onChange={(e) => setInstruccionesSena(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Color de marca (opcional)</span>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-14 rounded border border-slate-300 p-1"
            />
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </div>
        </label>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Enviando…" : "Enviar datos"}
        </button>
      </form>
    </main>
  );
}
