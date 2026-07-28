import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/lib/supabase";
import { env } from "@/lib/env";

export const runtime = "nodejs";

function safeNextPath(raw: string | null): string {
  if (!raw) return "/";
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  // Si vino un RedirectTo completo, quedarnos con el path
  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const u = new URL(value);
      value = u.searchParams.get("next") || u.pathname || "/";
    } catch {
      return "/";
    }
  }
  // Solo paths relativos de la app (anti open-redirect)
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function GET(req: NextRequest) {
  const rawUrl = env("NEXT_PUBLIC_SUPABASE_URL");
  const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const next = safeNextPath(
    req.nextUrl.searchParams.get("next") ||
      req.cookies.get("auth_next")?.value ||
      null
  );

  const fail = (reason: string) => {
    console.error("[auth/callback]", reason, {
      hasCode: Boolean(req.nextUrl.searchParams.get("code")),
      hasTokenHash: Boolean(req.nextUrl.searchParams.get("token_hash")),
      type: req.nextUrl.searchParams.get("type"),
      errorParam: req.nextUrl.searchParams.get("error"),
      errorDesc: req.nextUrl.searchParams.get("error_description"),
    });
    const url = new URL("/login", req.url);
    url.searchParams.set("error", "auth_callback");
    url.searchParams.set("reason", reason.slice(0, 120));
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  };

  if (!rawUrl || !anon) {
    return fail("missing_env");
  }

  // Errores que manda Supabase en el redirect
  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError) {
    return fail(
      req.nextUrl.searchParams.get("error_description") || oauthError
    );
  }

  const code = req.nextUrl.searchParams.get("code");
  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  const type = req.nextUrl.searchParams.get("type") as EmailOtpType | null;

  const redirectUrl = new URL(next, req.url);
  const response = NextResponse.redirect(redirectUrl);

  const supabase = createServerClient(normalizeSupabaseUrl(rawUrl), anon, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, {
            ...options,
            // Asegurar cookies en HTTPS prod
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
          });
        });
      },
    },
  });

  try {
    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
      if (error) return fail(error.message);
      response.cookies.set("auth_next", "", { path: "/", maxAge: 0 });
      return response;
    }

    // Algunos templates mandan type=magiclink sin tipar bien
    if (tokenHash && !type) {
      const { error } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: tokenHash,
      });
      if (error) return fail(error.message);
      response.cookies.set("auth_next", "", { path: "/", maxAge: 0 });
      return response;
    }

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return fail(error.message);
      response.cookies.set("auth_next", "", { path: "/", maxAge: 0 });
      return response;
    }

    return fail("missing_code_or_token");
  } catch (err) {
    return fail(err instanceof Error ? err.message : "callback_exception");
  }
}
