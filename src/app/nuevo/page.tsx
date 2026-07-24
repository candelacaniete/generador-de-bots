"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function NuevoPage() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nombre.trim()) {
      setError("Ingresá el nombre del negocio.");
      return;
    }
    if (!archivo) {
      setError("Seleccioná un archivo .docx o .pdf.");
      return;
    }

    setLoading(true);
    try {
      const form = new FormData();
      form.append("nombre", nombre.trim());
      form.append("archivo", archivo);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: form,
      });

      const raw = await res.text();
      let data: { error?: string; business_id?: string } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(
          res.ok
            ? "Respuesta inválida del servidor"
            : `Error del servidor (${res.status}). Revisá las variables de entorno en Vercel.`
        );
      }

      if (!res.ok) {
        throw new Error(data.error || "No se pudo crear el bot");
      }

      if (!data.business_id) {
        throw new Error("El servidor no devolvió el business_id");
      }

      router.push(`/bot/${data.business_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col justify-center px-4 py-12">
      <div className="mb-8">
        <p className="text-sm font-medium text-blue-600">Nuevo bot</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          Creá el chatbot de tu negocio
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Subí un PDF o Word con horarios, servicios, FAQ o precios. Lo
          procesamos y generamos un bot listo para embeber.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">
            Nombre del negocio
          </span>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Panadería Don Luis"
            disabled={loading}
            className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">
            Documento (.docx o .pdf)
          </span>
          <input
            type="file"
            accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={loading}
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-60"
          />
          {archivo ? (
            <span className="text-xs text-slate-500">{archivo.name}</span>
          ) : null}
        </label>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Procesando documento…" : "Crear chatbot"}
        </button>

        {loading ? (
          <p className="text-center text-xs text-slate-500">
            Extrayendo texto, generando embeddings y guardando en la base…
          </p>
        ) : null}
      </form>
    </main>
  );
}
