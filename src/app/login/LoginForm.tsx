"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const errorParam = searchParams.get("error");
  const reason = searchParams.get("reason");

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    if (errorParam === "auth_not_configured") {
      return "Falta next_public_supabase_anon_key (o la URL) en Vercel.";
    }
    if (errorParam === "admin_only") {
      return "Esta sección es solo para el equipo interno.";
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
    try {
      // Config desde el server (lee env en minúsculas) + PKCE en el browser
      const cfgRes = await fetch("/api/auth/public-config");
      const cfg = await cfgRes.json();
      if (!cfgRes.ok) throw new Error(cfg.error || "Auth no configurado");

      const supabase = createBrowserClient(cfg.url, cfg.anonKey);
      const origin = window.location.origin;
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

      // Por si el link se abre en otro device / template con token_hash
      document.cookie = `auth_next=${encodeURIComponent(next)}; Path=/; Max-Age=3600; SameSite=Lax`;

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true,
        },
      });
      if (otpError) {
        if (/rate limit/i.test(otpError.message)) {
          throw new Error(
            "Supabase frenó el envío de emails (rate limit). Esperá un rato o configurá SMTP con Resend."
          );
        }
        throw otpError;
      }
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
          llega, mirá spam. Abrilo en el mismo navegador donde lo pediste.
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
