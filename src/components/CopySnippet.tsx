"use client";

import { useState } from "react";

export default function CopySnippet({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback silencioso
    }
  }

  return (
    <div className="mt-4">
      <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
        {text}
      </pre>
      <button
        type="button"
        onClick={copy}
        className="mt-3 inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        {copied ? "¡Copiado!" : "Copiar snippet"}
      </button>
    </div>
  );
}
