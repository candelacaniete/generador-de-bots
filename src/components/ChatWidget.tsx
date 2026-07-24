"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  role: "user" | "bot";
  text: string;
};

type ChatWidgetProps = {
  businessId: string;
  businessName: string;
};

export default function ChatWidget({
  businessId,
  businessName,
}: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "bot",
      text: `¡Hola! Soy el asistente de ${businessName}. ¿En qué puedo ayudarte?`,
    },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    setInput("");
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", text },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: businessId, mensaje: text }),
      });
      const raw = await res.text();
      let data: { error?: string; respuesta?: string } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(
          `Error del servidor (${res.status}). Revisá los logs de Vercel.`
        );
      }
      if (!res.ok) throw new Error(data.error || "Error del chat");

      setMessages((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}`,
          role: "bot",
          text: data.respuesta || "Sin respuesta",
        },
      ]);
    } catch (err) {
      const detail =
        err instanceof Error
          ? err.message
          : "No pude responder ahora. Intentá de nuevo en un momento.";
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "bot",
          text: detail,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open ? (
        <div className="fixed bottom-24 right-4 z-50 flex h-[min(480px,70vh)] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:right-6">
          <div className="flex items-center justify-between bg-blue-600 px-4 py-3 text-white">
            <span className="text-sm font-semibold">{businessName}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xl leading-none opacity-90 hover:opacity-100"
              aria-label="Cerrar chat"
            >
              ×
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto bg-slate-50 p-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "ml-auto bg-blue-600 text-white"
                    : "border border-slate-200 bg-white text-slate-900"
                }`}
              >
                {m.text}
              </div>
            ))}
            {busy ? (
              <div className="max-w-[85%] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm italic text-slate-500">
                Escribiendo…
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={onSubmit}
            className="flex gap-2 border-t border-slate-200 bg-white p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribí tu consulta…"
              disabled={busy}
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              Enviar
            </button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition hover:scale-105 hover:bg-blue-700 sm:right-6"
        aria-label={open ? "Cerrar chat" : "Abrir chat"}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6 fill-current"
          aria-hidden="true"
        >
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z" />
        </svg>
      </button>
    </>
  );
}
