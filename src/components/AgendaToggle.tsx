"use client";

import { useState } from "react";

type Props = {
  businessId: string;
  initialEnabled: boolean;
};

export default function AgendaToggle({ businessId, initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !enabled;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/businesses/${businessId}/agenda`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agenda_habilitada: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo actualizar");
      setEnabled(Boolean(data.agenda_habilitada));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={toggle}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
          enabled
            ? "bg-emerald-600 text-white"
            : "border border-slate-300 bg-white text-slate-700"
        }`}
        title="Solo el equipo interno activa la turnera en el bot"
      >
        {busy ? "…" : enabled ? "Turnera ON" : "Turnera OFF"}
      </button>
      {error ? <p className="text-[11px] text-red-600">{error}</p> : null}
    </div>
  );
}
