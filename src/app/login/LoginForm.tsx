"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    errorParam === "auth_not_configured"
      ? "Falta configurar NEXT_PUBLIC_SUPABASE_ANON_KEY en Vercel."
      : errorParam === "admin_only"
        ? "Esta sección es solo para el equipo interno."
        : errorParam === "auth_callback"
          ? "No se pudo completar el login. Pedí otro link."
          : null
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserSupabase();
      const origin = window.location.origin;
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
          shouldCreateUser: true,
        },
      });
      if (otpError) throw otpError;
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
        <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          Revisá <strong>{email}</strong> y abrí el link para entrar. Si no
          llega, mirá spam.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@negocio.com"
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
