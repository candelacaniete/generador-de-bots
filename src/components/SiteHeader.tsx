"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Oculta el chrome del generador en panel PWA y onboarding público. */
export default function SiteHeader() {
  const pathname = usePathname();
  if (pathname?.startsWith("/panel/") || pathname?.startsWith("/onboarding/")) {
    return null;
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-sm font-semibold text-slate-900">
          BotGen
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/login?next=/cuenta"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Ingresar
          </Link>
        </div>
      </div>
    </header>
  );
}
