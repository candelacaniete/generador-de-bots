import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Bot no encontrado</h1>
      <p className="mt-2 text-sm text-slate-600">
        Ese business_id no existe o la base aún no está configurada.
      </p>
      <Link
        href="/nuevo"
        className="mt-6 inline-flex items-center justify-center self-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
      >
        Crear un bot
      </Link>
    </main>
  );
}
