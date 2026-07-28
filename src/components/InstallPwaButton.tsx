"use client";

import { useEffect, useState } from "react";

export default function InstallPwaButton() {
  const [deferred, setDeferred] = useState<{
    prompt: () => Promise<void>;
  } | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS Safari
      window.navigator.standalone === true;
    if (isStandalone) setInstalled(true);

    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua);
    setIosHint(isIos && !isStandalone);

    function onBip(e: Event) {
      e.preventDefault();
      const ev = e as Event & {
        prompt: () => Promise<void>;
      };
      setDeferred({ prompt: () => ev.prompt() });
    }

    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (installed) {
    return (
      <p className="text-xs text-emerald-700">App instalada en este dispositivo.</p>
    );
  }

  if (deferred) {
    return (
      <button
        type="button"
        onClick={() => deferred.prompt()}
        className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
      >
        Instalar app en el celular
      </button>
    );
  }

  if (iosHint) {
    return (
      <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-700">
        En iPhone: Safari → Compartir → <strong>Agregar a pantalla de inicio</strong>.
      </p>
    );
  }

  return (
    <p className="text-xs text-slate-500">
      En Android/Chrome va a aparecer la opción de instalar esta pantalla como app.
    </p>
  );
}
