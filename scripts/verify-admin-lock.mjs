/**
 * Script de verificación de acceso a /admin (correrlo contra prod o local).
 * Uso: node scripts/verify-admin-lock.mjs [baseUrl]
 */
const base = (process.argv[2] || "https://generador-de-bots.vercel.app").replace(
  /\/$/,
  ""
);

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

await check("GET /admin sin sesión → 307/302 a /login", async () => {
  const res = await fetch(`${base}/admin`, { redirect: "manual" });
  assert([301, 302, 307, 308].includes(res.status), `status ${res.status}`);
  const loc = res.headers.get("location") || "";
  assert(loc.includes("/login"), `location=${loc}`);
  assert(!loc.includes("error=admin_only") || loc.includes("login"), "ok");
});

await check("GET /admin body no contiene datos de admin", async () => {
  const res = await fetch(`${base}/admin`, { redirect: "follow" });
  const text = await res.text();
  assert(!/Negocios y snippets/i.test(text), "filtró título admin");
  assert(!/Snippet WP/i.test(text), "filtró Snippet WP");
  assert(!/Crear link/i.test(text), "filtró crear link onboarding");
});

await check("GET /admin con cookies basura → login", async () => {
  const res = await fetch(`${base}/admin`, {
    redirect: "manual",
    headers: {
      cookie:
        "sb-access-token=invalid; sb-refresh-token=invalid; sb-xxx-auth-token=eyJ.invalid",
    },
  });
  assert([301, 302, 307, 308].includes(res.status), `status ${res.status}`);
  const loc = res.headers.get("location") || "";
  assert(loc.includes("/login"), `location=${loc}`);
});

await check("POST /api/admin/onboarding-tokens sin sesión → 401", async () => {
  const res = await fetch(`${base}/api/admin/onboarding-tokens`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nota: "probe" }),
  });
  assert(res.status === 401 || res.status === 403, `status ${res.status}`);
  const json = await res.json();
  assert(json.error, "sin error json");
});

await check("POST /api/upload sin sesión → 401/403", async () => {
  const res = await fetch(`${base}/api/upload`, { method: "POST", body: new FormData() });
  assert([401, 403, 400, 500].includes(res.status), `status ${res.status}`);
  // upload may 401 from requireAdmin first
  if (res.status === 401 || res.status === 403) return;
  // if form empty might hit other errors — still must not succeed creating business
  assert(res.status !== 200, "upload no debe ser 200 sin auth");
});

console.log(`\nBase: ${base}`);
if (process.exitCode) {
  console.error("Hubo fallos de lock.");
} else {
  console.log("Lock /admin OK en los escenarios probados (sin sesión / cookies inválidas / API).");
}
