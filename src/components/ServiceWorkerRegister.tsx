"use client";

import { useEffect } from "react";

/**
 * Registra SW solo para el panel, y limpia caches viejos que guardaban el HTML de /.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    (async () => {
      try {
        // Limpiar SW/caches viejos que rompían el CSS del sitio
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(
            keys
              .filter((k) => k.startsWith("botgen-panel"))
              .map((k) => caches.delete(k))
          );
        }
        if (cancelled) return;
        await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
