import type { Metadata, Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ensureBusinessAccess, getAuthUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ business_id: string }>;
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ business_id: string }>;
}): Promise<Metadata> {
  const { business_id } = await params;
  let nombre = "Panel";
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("businesses")
      .select("nombre")
      .eq("id", business_id)
      .maybeSingle();
    if (data?.nombre) nombre = data.nombre;
  } catch {
    /* ignore */
  }

  return {
    title: `Turnos · ${nombre}`,
    description: `Panel interno de turnos de ${nombre}`,
    applicationName: `Turnos ${nombre}`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: `Turnos ${nombre}`,
    },
    manifest: `/api/panel/${business_id}/manifest`,
    icons: [
      { rel: "icon", url: "/icons/icon-192.png", sizes: "192x192" },
      { rel: "apple-touch-icon", url: "/icons/icon-192.png" },
    ],
  };
}

export default async function PanelLayout({ children, params }: LayoutProps) {
  const { business_id } = await params;

  const user = await getAuthUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/panel/${business_id}`)}`);
  }

  const access = await ensureBusinessAccess(user, business_id);
  if (!access.ok) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col justify-center px-4 py-12">
        <h1 className="text-xl font-semibold text-slate-900">Sin acceso</h1>
        <p className="mt-2 text-sm text-slate-600">
          Tu cuenta no tiene acceso a este panel. Contactanos si creés que es
          un error.
        </p>
        <div className="mt-4">
          <LogoutButton />
        </div>
      </main>
    );
  }

  let business: { id: string; nombre: string } | null = null;
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("businesses")
      .select("id, nombre")
      .eq("id", business_id)
      .maybeSingle();
    business = data;
  } catch {
    /* ignore */
  }

  if (!business) notFound();

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col bg-slate-50">
      <ServiceWorkerRegister />
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Panel interno
            </p>
            <p className="text-sm font-semibold text-slate-900">
              {business.nombre}
            </p>
          </div>
          <LogoutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
