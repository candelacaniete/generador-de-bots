/**
 * Genera un snippet JS standalone (vanilla) con business_id hardcodeado.
 * Autocontenido: inyecta CSS + UI de chat flotante.
 */
import { normalizeAppUrl } from "@/lib/app-url";

export function generateWidgetScript(options: {
  businessId: string;
  apiBaseUrl: string;
  businessName?: string;
  primaryColor?: string;
}): string {
  const {
    businessId,
    apiBaseUrl,
    businessName = "Asistente",
    primaryColor = "#2563eb",
  } = options;

  const base = normalizeAppUrl(apiBaseUrl) ?? apiBaseUrl.replace(/\/$/, "");
  const apiUrl = `${base}/api/chat`;
  const safeName = JSON.stringify(businessName);
  const safeId = JSON.stringify(businessId);
  const safeApi = JSON.stringify(apiUrl);
  const safeColor = JSON.stringify(primaryColor);

  return `/*! Chatbot widget — business ${businessId} */
(function () {
  "use strict";
  if (window.__ChatbotWidgetLoaded) return;
  window.__ChatbotWidgetLoaded = true;

  var BUSINESS_ID = ${safeId};
  var API_URL = ${safeApi};
  var BOT_NAME = ${safeName};
  var PRIMARY = ${safeColor};

  var css = ""
    + "#cb-root{all:initial;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}"
    + "#cb-root *{box-sizing:border-box;}"
    + "#cb-bubble{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;"
    + "background:" + PRIMARY + ";color:#fff;border:none;cursor:pointer;z-index:2147483000;"
    + "box-shadow:0 8px 24px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;"
    + "transition:transform .15s ease;}"
    + "#cb-bubble:hover{transform:scale(1.05);}"
    + "#cb-bubble svg{width:26px;height:26px;fill:currentColor;}"
    + "#cb-panel{position:fixed;right:20px;bottom:88px;width:360px;max-width:calc(100vw - 24px);"
    + "height:480px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;"
    + "box-shadow:0 16px 48px rgba(0,0,0,.2);z-index:2147483000;display:none;flex-direction:column;"
    + "overflow:hidden;border:1px solid #e5e7eb;}"
    + "#cb-panel.open{display:flex;}"
    + "#cb-header{background:" + PRIMARY + ";color:#fff;padding:14px 16px;font-size:15px;font-weight:600;"
    + "display:flex;align-items:center;justify-content:space-between;}"
    + "#cb-close{background:transparent;border:none;color:#fff;font-size:22px;line-height:1;cursor:pointer;opacity:.9;}"
    + "#cb-messages{flex:1;overflow-y:auto;padding:16px;background:#f8fafc;display:flex;flex-direction:column;gap:10px;}"
    + ".cb-msg{max-width:85%;padding:10px 12px;border-radius:12px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-break:break-word;}"
    + ".cb-msg.bot{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid #e2e8f0;}"
    + ".cb-msg.user{align-self:flex-end;background:" + PRIMARY + ";color:#fff;}"
    + ".cb-msg.typing{opacity:.7;font-style:italic;}"
    + "#cb-form{display:flex;gap:8px;padding:12px;border-top:1px solid #e5e7eb;background:#fff;}"
    + "#cb-input{flex:1;border:1px solid #d1d5db;border-radius:10px;padding:10px 12px;font-size:14px;outline:none;}"
    + "#cb-input:focus{border-color:" + PRIMARY + ";box-shadow:0 0 0 3px rgba(37,99,235,.15);}"
    + "#cb-send{background:" + PRIMARY + ";color:#fff;border:none;border-radius:10px;padding:0 14px;"
    + "font-size:14px;font-weight:600;cursor:pointer;}"
    + "#cb-send:disabled{opacity:.6;cursor:not-allowed;}"
    + "@media (max-width:420px){#cb-panel{right:12px;bottom:80px;width:calc(100vw - 24px);height:70vh;}}";

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var root = document.createElement("div");
  root.id = "cb-root";
  root.innerHTML = ""
    + '<button id="cb-bubble" type="button" aria-label="Abrir chat">'
    + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg>'
    + "</button>"
    + '<div id="cb-panel" role="dialog" aria-label="Chat">'
    + '  <div id="cb-header"><span>' + BOT_NAME + '</span><button id="cb-close" type="button" aria-label="Cerrar">×</button></div>'
    + '  <div id="cb-messages"></div>'
    + '  <form id="cb-form">'
    + '    <input id="cb-input" type="text" placeholder="Escribí tu consulta..." autocomplete="off" />'
    + '    <button id="cb-send" type="submit">Enviar</button>'
    + "  </form>"
    + "</div>";
  document.body.appendChild(root);

  var bubble = document.getElementById("cb-bubble");
  var panel = document.getElementById("cb-panel");
  var closeBtn = document.getElementById("cb-close");
  var form = document.getElementById("cb-form");
  var input = document.getElementById("cb-input");
  var sendBtn = document.getElementById("cb-send");
  var messages = document.getElementById("cb-messages");
  var busy = false;

  function addMsg(text, who) {
    var el = document.createElement("div");
    el.className = "cb-msg " + who;
    el.textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }

  function toggle(open) {
    if (open === undefined) open = !panel.classList.contains("open");
    panel.classList.toggle("open", open);
    if (open) {
      if (!messages.childElementCount) {
        addMsg("¡Hola! ¿En qué puedo ayudarte?", "bot");
      }
      setTimeout(function () { input.focus(); }, 50);
    }
  }

  bubble.addEventListener("click", function () { toggle(); });
  closeBtn.addEventListener("click", function () { toggle(false); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    var text = (input.value || "").trim();
    if (!text) return;

    addMsg(text, "user");
    input.value = "";
    busy = true;
    sendBtn.disabled = true;
    var typing = addMsg("Escribiendo...", "bot typing");

    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_id: BUSINESS_ID, mensaje: text })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Error del servidor");
          return data;
        });
      })
      .then(function (data) {
        typing.remove();
        addMsg(data.respuesta || "Sin respuesta", "bot");
      })
      .catch(function (err) {
        typing.remove();
        addMsg("No pude responder ahora. Intentá de nuevo en un momento.", "bot");
        console.error("[Chatbot]", err);
      })
      .finally(function () {
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      });
  });
})();
`;
}
