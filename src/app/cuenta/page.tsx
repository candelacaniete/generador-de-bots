import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import { adminEmails, getAuthUser, isAdminEmail } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function CuentaPage() {
  const user = await getAuthUser();
  if (!user) {
    redirect("/login?next=/cuenta");
  }

  const email = user.email?.toLowerCase() ?? "";
  const admin = isAdminEmail(email);
  const configuredAdmins = adminEmails();

  const supabase = getSupabase();

  // Negocios donde es member o owner_email
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

      {admin ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">
            Acceso admin interno
          </p>
          <Link
            href="/admin"
            className="mt-3 inline-flex rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
          >
            Ir al admin
          </Link>
        </section>
      ) : (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">No figurás como admin interno</p>
          <p className="mt-1 text-xs leading-relaxed">
            Para entrar a <code>/admin</code>, agregá exactamente{" "}
            <strong>{email}</strong> en la env{" "}
            <code>admin_emails</code> de Vercel
            {configuredAdmins.length
              ? ` (ahora tiene: ${configuredAdmins.join(", ")})`
              : " (ahora está vacía)"}{" "}
            y hacé redeploy.
          </p>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-slate-900">Tus paneles</h2>
        {businesses.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            Todavía no tenés un negocio asociado. Si sos admin, crealo desde
            el panel interno.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {businesses.map((b) => (
              <li key={b.id} className="flex items-center justify-between px-4 py-3">
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
        )}
      </section>
    </main>
  );
}
