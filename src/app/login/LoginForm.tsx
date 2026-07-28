"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/cuenta";
  const errorParam = searchParams.get("error");
  const reason = searchParams.get("reason");
  const blockedEmail = searchParams.get("email");

  const [email, setEmail] = useState(blockedEmail || "");
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    if (errorParam === "auth_not_configured") {
      return "Falta configurar Supabase en Vercel.";
    }
    if (errorParam === "admin_only") {
      return (
        `Tu sesión${blockedEmail ? ` (${blockedEmail})` : ""} no está en admin_emails. ` +
        `En Vercel → Environment Variables poné: admin_emails=candela.caniete1@gmail.com,mailpruebascandela@gmail.com ` +
        `(el mail exacto con el que pedís el link) y redeploy.`
      );
    }
    if (errorParam === "auth_callback") {
      return reason
        ? `No se pudo completar el login (${reason}). Pedí otro link.`
        : "No se pudo completar el login. Pedí otro link.";
    }
    return null;
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo enviar el link");
      if (data.notice) setNotice(data.notice);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Ingresar al panel
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Te mandamos un link mágico al email. Sin contraseña.
      </p>

      {sent ? (
        <div className="mt-6 space-y-3">
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
            Revisá <strong>{email}</strong> y abrí el link. Si no llega, mirá
            spam.
          </p>
          {notice ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {notice}
            </p>
          ) : null}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
            />
          </label>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Enviando…" : "Enviar link de acceso"}
          </button>
        </form>
      )}
    </main>
  );
}
