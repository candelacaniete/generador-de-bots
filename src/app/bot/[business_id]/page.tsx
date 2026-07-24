import Link from "next/link";
import { notFound } from "next/navigation";
import ChatWidget from "@/components/ChatWidget";
import { getSupabase } from "@/lib/supabase";

type PageProps = {
  params: Promise<{ business_id: string }>;
};

export default async function BotPage({ params }: PageProps) {
  const { business_id } = await params;

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
          Probá el chat con la burbuja de abajo a la derecha. Cuando esté listo,
          descargá el script para pegarlo en WordPress.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          Instalar en tu sitio
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Descargá el archivo <code className="text-xs">.js</code> y pegalo en
          el footer o en el Custom HTML de WordPress. El{" "}
          <code className="text-xs">business_id</code> ya viene incluido.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={`/api/widget/${business.id}`}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Descargar script
          </a>
          <code className="self-center rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700">
            {business.id}
          </code>
        </div>

        <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
{`<!-- Pegá esto antes de </body> -->
<script src="https://TU-DOMINIO/chatbot-${business.slug}.js"></script>
<!-- O subí el .js descargado a tu hosting y apuntá a esa URL -->`}
        </pre>
      </section>

      <ChatWidget businessId={business.id} businessName={business.nombre} />
    </main>
  );
}
