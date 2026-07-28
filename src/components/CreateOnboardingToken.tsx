"use client";

import { FormEvent, useState } from "react";

export default function CreateOnboardingToken() {
  const [nota, setNota] = useState("");
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setUrl(null);
    try {
      const res = await fetch("/api/admin/onboarding-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota, days }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setUrl(data.url);
      setNota("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">
        Generar link de onboarding
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Mandás este link al negocio recién cerrado. Un solo uso.
      </p>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota interna (opcional)"
          className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="number"
          min={1}
          max={90}
          value={days}
          onChange={(e) => setDays(Number(e.target.value) || 14)}
          className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-sm"
          title="Días de validez"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "…" : "Crear link"}
        </button>
      </form>
      {error ? (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      ) : null}
      {url ? (
        <p className="mt-3 break-all rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {url}
        </p>
      ) : null}
    </section>
  );
}
