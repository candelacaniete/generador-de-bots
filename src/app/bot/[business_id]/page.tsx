import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import AgendaPanel from "@/components/AgendaPanel";
import ChatWidget from "@/components/ChatWidget";
import CopySnippet from "@/components/CopySnippet";
import { env } from "@/lib/env";
import { normalizeAppUrl } from "@/lib/app-url";
import { getSupabase } from "@/lib/supabase";

type PageProps = {
  params: Promise<{ business_id: string }>;
  searchParams: Promise<{ calendar?: string }>;
};

async function resolveAppUrl(): Promise<string> {
  const fromEnv = normalizeAppUrl(env("NEXT_PUBLIC_APP_URL"));
  if (fromEnv) return fromEnv;

  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`;
  return "";
}

export default async function BotPage({ params, searchParams }: PageProps) {
  const { business_id } = await params;
  const { calendar } = await searchParams;

  let business: { id: string; nombre: string; slug: string } | null = null;

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("businesses")
      .select("id, nombre, slug")
      .eq("id", business_id)
      .maybeSingle();

    if (error) {
      console.error(error);
    }
    business = data;
  } catch (err) {
    console.error(err);
  }

  if (!business) {
    notFound();
  }

  const appUrl = await resolveAppUrl();
  const widgetUrl = appUrl
    ? `${appUrl}/api/widget/${business.id}`
    : `/api/widget/${business.id}`;
  const embedSnippet = `<script src="${widgetUrl}" defer></script>`;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col px-4 py-10">
      <div className="mb-8">
        <Link
          href="/nuevo"
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          ← Crear otro bot
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
          {business.nombre}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Probá el chat, configurá la agenda y pegá el snippet en WordPress.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          Instalar en tu sitio
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Copiá y pegá esta línea antes de{" "}
          <code className="text-xs">&lt;/body&gt;</code> (o en un bloque HTML
          personalizado / footer de WordPress).
        </p>

        <CopySnippet text={embedSnippet} />

        <p className="mt-4 text-xs text-slate-500">
          URL del script:{" "}
          <a
            href={widgetUrl}
            target="_blank"
            rel="noreferrer"
            className="break-all text-blue-600 hover:underline"
          >
            {widgetUrl}
          </a>
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={`/api/widget/${business.id}?download=1`}
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            Descargar .js (opcional)
          </a>
          <code className="self-center rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700">
            {business.id}
          </code>
        </div>
      </section>

      <AgendaPanel businessId={business.id} calendarStatus={calendar ?? null} />

      <ChatWidget businessId={business.id} businessName={business.nombre} />
    </main>
  );
}
