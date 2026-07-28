import Link from "next/link";
import { notFound } from "next/navigation";
import AgendaPanel from "@/components/AgendaPanel";
import InstallPwaButton from "@/components/InstallPwaButton";
import TurnosBoard from "@/components/TurnosBoard";
import { getSupabase } from "@/lib/supabase";

type Props = {
  params: Promise<{ business_id: string }>;
  searchParams: Promise<{ tab?: string; calendar?: string }>;
};

export default async function PanelPage({ params, searchParams }: Props) {
  const { business_id } = await params;
  const { tab, calendar } = await searchParams;
  const activeTab = tab === "config" ? "config" : "turnos";

  let business: { id: string; nombre: string } | null = null;
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("businesses")
      .select("id, nombre")
      .eq("id", business_id)
      .maybeSingle();
    business = data;
  } catch (err) {
    console.error(err);
  }

  if (!business) notFound();

  return (
    <main className="flex flex-1 flex-col gap-5 px-4 py-5">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Panel interno: mirá los turnos, confirmalos o cancelalos. Instalalo en
          el celular como app.
        </p>
        <InstallPwaButton />
      </div>

      <nav className="flex gap-2">
        <Link
          href={`/panel/${business.id}`}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            activeTab === "turnos"
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          Turnos
        </Link>
        <Link
          href={`/panel/${business.id}?tab=config`}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            activeTab === "config"
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          Configuración
        </Link>
      </nav>

      {activeTab === "turnos" ? (
        <TurnosBoard businessId={business.id} />
      ) : (
        <AgendaPanel
          businessId={business.id}
          calendarStatus={calendar ?? null}
          hideBookings
        />
      )}
    </main>
  );
}
