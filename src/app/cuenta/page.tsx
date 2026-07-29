import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import { getAuthUser, isAdminEmail } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function CuentaPage() {
  const user = await getAuthUser();
  if (!user) {
    redirect("/login?next=/cuenta");
  }

  const email = user.email?.toLowerCase() ?? "";
  const admin = isAdminEmail(email);

  const supabase = getSupabase();

  const [{ data: members }, { data: owned }] = await Promise.all([
    supabase
      .from("business_members")
      .select("business_id, rol, businesses(id, nombre)")
      .eq("user_id", user.id),
    supabase
      .from("businesses")
      .select("id, nombre")
      .eq("owner_email", email)
      .limit(50),
  ]);

  type Biz = { id: string; nombre: string };
  const map = new Map<string, Biz>();
  for (const row of members ?? []) {
    const b = row.businesses as unknown as Biz | Biz[] | null;
    const biz = Array.isArray(b) ? b[0] : b;
    if (biz?.id) map.set(biz.id, biz);
  }
  for (const b of owned ?? []) {
    map.set(b.id, b);
  }
  const businesses = [...map.values()];

  // Admin: ir directo al área interna (solo visible para admin)
  if (admin) {
    redirect("/admin");
  }

  // Un solo negocio: directo al panel
  if (businesses.length === 1) {
    redirect(`/panel/${businesses[0].id}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Tu cuenta
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{email}</h1>
        </div>
        <LogoutButton />
      </div>

      {businesses.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
          <p>
            Tu cuenta no tiene acceso asignado. Contactanos para que te demos
            acceso.
          </p>
        </section>
      ) : (
        <section>
          <h2 className="text-sm font-semibold text-slate-900">Tus paneles</h2>
          <ul className="mt-3 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {businesses.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="text-sm font-medium text-slate-900">
                  {b.nombre}
                </span>
                <Link
                  href={`/panel/${b.id}`}
                  className="text-sm font-semibold text-blue-600"
                >
                  Abrir
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
