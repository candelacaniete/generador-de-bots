import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function normalizeSupabaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) {
    if (/^[a-z0-9-]+$/i.test(url)) url = `https://${url}.supabase.co`;
  }
  const parsed = new URL(url);
  return parsed.origin;
}

function adminEmails(): string[] {
  const raw =
    process.env.ADMIN_EMAILS ||
    process.env.admin_emails ||
    "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const needsAuth =
    pathname.startsWith("/panel/") ||
    pathname.startsWith("/bot/") ||
    pathname.startsWith("/nuevo") ||
    pathname.startsWith("/admin");

  if (!needsAuth) {
    return NextResponse.next();
  }

  const rawUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.next_public_supabase_url;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.next_public_supabase_anon_key;

  if (!rawUrl || !anon) {
    const login = new URL("/login", request.url);
    login.searchParams.set("error", "auth_not_configured");
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(normalizeSupabaseUrl(rawUrl), anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }

  const email = user.email?.toLowerCase() ?? "";
  const isAdmin = adminEmails().includes(email);

  // /bot, /nuevo y /admin: solo admins internos
  if (
    (pathname.startsWith("/bot/") ||
      pathname.startsWith("/nuevo") ||
      pathname.startsWith("/admin")) &&
    !isAdmin
  ) {
    return NextResponse.redirect(new URL("/login?error=admin_only", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/panel/:path*",
    "/bot/:path*",
    "/nuevo",
    "/nuevo/:path*",
    "/admin",
    "/admin/:path*",
  ],
};
