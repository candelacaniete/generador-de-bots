import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { normalizeSupabaseUrl } from "@/lib/supabase";
import { env } from "@/lib/env";

export const runtime = "nodejs";

async function signOut(req: NextRequest) {
  const rawUrl = env("NEXT_PUBLIC_SUPABASE_URL");
  const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const response = NextResponse.redirect(new URL("/login", req.url));

  if (!rawUrl || !anon) {
    return response;
  }

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

  await supabase.auth.signOut();
  return response;
}

export async function GET(req: NextRequest) {
  return signOut(req);
}

export async function POST(req: NextRequest) {
  const rawUrl = env("NEXT_PUBLIC_SUPABASE_URL");
  const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const response = NextResponse.json({ ok: true });

  if (!rawUrl || !anon) return response;

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

  await supabase.auth.signOut();
  return response;
}
