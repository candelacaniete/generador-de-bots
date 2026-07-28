"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Oculta el chrome del generador en el panel PWA interno. */
export default function SiteHeader() {
  const pathname = usePathname();
  if (pathname?.startsWith("/panel/")) return null;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-sm font-semibold text-slate-900">
          BotGen
        </Link>
        <Link
          href="/nuevo"
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Nuevo bot
        </Link>
      </div>
    </header>
  );
}
