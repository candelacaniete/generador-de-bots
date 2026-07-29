import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16">
      <p className="text-sm font-medium text-blue-600">Generador de chatbots</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Chatbots con IA para tu negocio
      </h1>
      <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-600">
        Subí un documento con la info de tu negocio y obtené un asistente listo
        para embeber en WordPress o cualquier sitio web.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/login?next=/cuenta"
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Ingresar al panel
        </Link>
      </div>
    </main>
  );
}
