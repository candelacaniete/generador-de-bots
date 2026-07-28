import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { normalizeSupabaseUrl } from "@/lib/supabase";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next") || "/";

  const rawUrl = env("NEXT_PUBLIC_SUPABASE_URL");
  const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!rawUrl || !anon || !code) {
    return NextResponse.redirect(
      new URL("/login?error=auth_callback", req.url)
    );
  }

  const redirectUrl = new URL(next, req.url);
  const response = NextResponse.redirect(redirectUrl);

  const supabase = createServerClient(normalizeSupabaseUrl(rawUrl), anon, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=auth_callback", req.url)
    );
  }

  return response;
}
