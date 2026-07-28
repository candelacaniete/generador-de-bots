import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { getSupabase, normalizeSupabaseUrl } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export type PanelRole = "owner" | "staff" | "admin_interno";

export function adminEmails(): string[] {
  const raw = env("ADMIN_EMAILS") || "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}

export async function getAuthUser(): Promise<User | null> {
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
}

/**
 * Crea client de Auth leyendo cookies del request (para Route Handlers / middleware-like checks).
 */
export function createRequestSupabase(req: NextRequest, res: NextResponse) {
  const rawUrl = env("NEXT_PUBLIC_SUPABASE_URL");
  const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!rawUrl || !anon) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  const url = normalizeSupabaseUrl(rawUrl);

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });
}

export async function getUserFromRequest(
  req: NextRequest
): Promise<{ user: User | null; response: NextResponse }> {
  const response = NextResponse.next();
  try {
    const supabase = createRequestSupabase(req, response);
    const { data } = await supabase.auth.getUser();
    return { user: data.user ?? null, response };
  } catch {
    return { user: null, response };
  }
}

/**
 * Verifica acceso al negocio. Si el email coincide con owner_email y aún no hay membership, hace claim.
 */
export async function ensureBusinessAccess(
  user: User,
  businessId: string
): Promise<{ ok: true; role: PanelRole | "admin" } | { ok: false; error: string }> {
  const email = user.email?.toLowerCase() ?? "";
  if (isAdminEmail(email)) {
    return { ok: true, role: "admin" };
  }

  const supabase = getSupabase();

  const { data: member } = await supabase
    .from("business_members")
    .select("rol")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (member?.rol) {
    return { ok: true, role: member.rol as PanelRole };
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("id, owner_email")
    .eq("id", businessId)
    .maybeSingle();

  if (!business) {
    return { ok: false, error: "Negocio no encontrado" };
  }

  const ownerEmail = business.owner_email?.trim().toLowerCase() ?? "";
  if (ownerEmail && ownerEmail === email) {
    const { error } = await supabase.from("business_members").upsert(
      {
        business_id: businessId,
        user_id: user.id,
        email,
        rol: "owner",
      },
      { onConflict: "business_id,user_id" }
    );
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, role: "owner" };
  }

  return {
    ok: false,
    error:
      "No tenés acceso a este panel. Pedile al equipo que asocie tu email al negocio.",
  };
}

export async function requireBusinessApiAccess(
  req: NextRequest,
  businessId: string
): Promise<
  | { ok: true; user: User; role: PanelRole | "admin" }
  | { ok: false; response: NextResponse }
> {
  const { user } = await getUserFromRequest(req);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Tenés que iniciar sesión" },
        { status: 401 }
      ),
    };
  }

  const access = await ensureBusinessAccess(user, businessId);
  if (!access.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: access.error }, { status: 403 }),
    };
  }

  return { ok: true, user, role: access.role };
}

export async function requireAdminApiAccess(
  req: NextRequest
): Promise<
  | { ok: true; user: User }
  | { ok: false; response: NextResponse }
> {
  const { user } = await getUserFromRequest(req);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Tenés que iniciar sesión" },
        { status: 401 }
      ),
    };
  }
  if (!isAdminEmail(user.email)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Solo admin" }, { status: 403 }),
    };
  }
  return { ok: true, user };
}
