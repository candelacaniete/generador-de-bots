import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import CreateOnboardingToken from "@/components/CreateOnboardingToken";
import AgendaToggle from "@/components/AgendaToggle";
import { getAuthUser, isAdminEmail } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  // Re-validación server-side (además del layout y el middleware)
  const user = await getAuthUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    redirect("/login?error=admin_only");
  }

  const supabase = getSupabase();
  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, nombre, slug, agenda_habilitada, owner_email, creado_en")
    .order("creado_en", { ascending: false })
    .limit(100);

  const { data: tokens } = await supabase
    .from("onboarding_tokens")
    .select("id, token, expires_at, usado_en, business_id, nota, creado_en")
    .order("creado_en", { ascending: false })
    .limit(20);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Admin interno
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            Negocios y snippets
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Solo el equipo ve snippets WP. Los clientes entran por el panel.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/nuevo"
            className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
          >
            Nuevo bot (PDF)
          </Link>
          <LogoutButton />
        </div>
      </div>

      <CreateOnboardingToken />

      <section>
        <h2 className="text-sm font-semibold text-slate-900">Negocios</h2>
        <ul className="mt-3 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {(businesses ?? []).map((b) => (
            <li
              key={b.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-slate-900">{b.nombre}</p>
                <p className="text-xs text-slate-500">
                  {b.owner_email || "sin owner_email"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AgendaToggle
                  businessId={b.id}
                  initialEnabled={Boolean(b.agenda_habilitada)}
                />
                <Link
                  href={`/bot/${b.id}`}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800"
                >
                  Snippet WP
                </Link>
                <Link
                  href={`/panel/${b.id}`}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Panel
                </Link>
              </div>
            </li>
          ))}
          {!businesses?.length ? (
            <li className="px-4 py-6 text-center text-sm text-slate-500">
              Todavía no hay negocios.
            </li>
          ) : null}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-900">
          Tokens de onboarding recientes
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(tokens ?? []).map((t) => (
            <li
              key={t.id}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2"
            >
              <code className="break-all text-xs">{t.token}</code>
              <p className="mt-1 text-xs text-slate-500">
                {t.usado_en
                  ? `Usado ${new Date(t.usado_en).toLocaleString("es-AR")}`
                  : `Expira ${new Date(t.expires_at).toLocaleString("es-AR")}`}
                {t.nota ? ` · ${t.nota}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
