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
    .split(/[,;\n]/)
    .map((e) => e.trim().toLowerCase().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}

function redirectToLogin(request: NextRequest, pathname: string, error?: string) {
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + request.nextUrl.search);
  if (error) login.searchParams.set("error", error);
  return NextResponse.redirect(login);
}

/**
 * Fail-closed: cualquier error de auth → redirect a login (nunca dejar pasar).
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const needsAuth =
    pathname.startsWith("/panel/") ||
    pathname.startsWith("/bot/") ||
    pathname.startsWith("/nuevo") ||
    pathname.startsWith("/admin") ||
    pathname === "/cuenta" ||
    pathname.startsWith("/cuenta/");

  if (!needsAuth) {
    return NextResponse.next();
  }

  const isAdminRoute =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/bot/") ||
    pathname.startsWith("/nuevo");

  try {
    const rawUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.next_public_supabase_url;
    const anon =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.next_public_supabase_anon_key;

    if (!rawUrl || !anon) {
      return redirectToLogin(request, pathname, "auth_not_configured");
    }

    // Rutas admin: sin lista configurada → denegar siempre
    if (isAdminRoute && adminEmails().length === 0) {
      console.error("[middleware] admin_emails vacío — denegando ruta admin");
      return redirectToLogin(request, pathname, "admin_only");
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
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return redirectToLogin(request, pathname);
    }

    if (isAdminRoute && !isAdminEmail(user.email)) {
      // No filtrar el email ni detalles técnicos en la URL
      return redirectToLogin(request, pathname, "admin_only");
    }

    return response;
  } catch (err) {
    console.error("[middleware] fail-closed", err);
    return redirectToLogin(request, pathname);
  }
}

export const config = {
  matcher: [
    "/panel/:path*",
    "/bot/:path*",
    "/nuevo",
    "/nuevo/:path*",
    "/admin",
    "/admin/:path*",
    "/cuenta",
    "/cuenta/:path*",
  ],
};
