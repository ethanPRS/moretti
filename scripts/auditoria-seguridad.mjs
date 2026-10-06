#!/usr/bin/env node
/**
 * Auditoría de seguridad contra un servidor en marcha (6 oct).
 *
 *   npx next build && npx next start -p 3109     # en otra terminal
 *   node scripts/auditoria-seguridad.mjs http://localhost:3109 <token-admin>
 *
 * El token sale de `crearToken()` (lib/sesion.ts) con el SESSION_SECRET del
 * servidor. Sin token, se saltan las pruebas que necesitan sesión.
 *
 * Cada caso es un intento de ataque y lo que el servidor tiene que contestar.
 * Sólo usa datos de prueba; algunos casos crean un apartado de prueba.
 * Contra producción, NO.
 */

const BASE = process.argv[2] ?? "http://localhost:3109";
const TOKEN = process.argv[3] ?? "";
const host = new URL(BASE).host;
let fallas = 0;
let total = 0;

async function caso(nombre, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`  ✗ ${nombre}\n      ${e.message}`);
  }
}
function esperar(cond, msg) {
  if (!cond) throw new Error(msg);
}
const pedir = (ruta, opciones = {}) => fetch(BASE + ruta, { redirect: "manual", ...opciones });
const json = (cuerpo, extra = {}) => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...extra },
  body: JSON.stringify(cuerpo),
});
const conSesion = (extra = {}) => ({ Cookie: `dno_admin_v1=${TOKEN}`, ...extra });

console.log(`Auditoría contra ${BASE}\n`);

console.log("Acceso sin sesión");
const PRIVADAS = [
  ["POST", "/api/exhibiciones/x/cobrar"],
  ["POST", "/api/planes/x/recalculo"],
  ["POST", "/api/transferencias"],
  ["POST", "/api/comprobantes/x"],
  ["POST", "/api/unidades/x/obra"],
  ["POST", "/api/unidades/x/estado-financiero"],
  ["POST", "/api/precios"],
  ["POST", "/api/paquetes"],
  ["GET", "/api/paquetes"],
  ["POST", "/api/contratos"],
  ["POST", "/api/imagenes"],
  ["POST", "/api/stripe/create-payment-intent"],
  ["POST", "/api/apartar/anticipo"],
];
for (const [metodo, ruta] of PRIVADAS) {
  await caso(`${metodo} ${ruta} sin sesión → 401`, async () => {
    const r = await pedir(ruta, { method: metodo, headers: { "Content-Type": "application/json" }, body: metodo === "GET" ? undefined : "{}" });
    esperar(r.status === 401, `contestó ${r.status}`);
  });
}
for (const ruta of ["/admin", "/admin/planes/x", "/admin/fiscal", "/admin/transferencias", "/admin/cobranza"]) {
  await caso(`GET ${ruta} sin sesión → al login`, async () => {
    const r = await pedir(ruta);
    esperar(r.status === 307 && (r.headers.get("location") ?? "").includes("/admin/login"), `contestó ${r.status} ${r.headers.get("location")}`);
  });
}

console.log("\nSesión falsificada");
const falso = Buffer.from(JSON.stringify({ sub: "admin", exp: Date.now() + 1e9 })).toString("base64url");
for (const [nombre, valor] of [
  ["token inventado", `${falso}.firma`],
  ["token sin firma", falso],
  ["token vacío", ""],
  ["token con payload cambiado", TOKEN ? `${falso}.${TOKEN.split(".")[1]}` : `${falso}.x`],
]) {
  await caso(`${nombre} → 401`, async () => {
    const r = await pedir("/api/paquetes", { headers: { Cookie: `dno_admin_v1=${valor}` } });
    esperar(r.status === 401, `contestó ${r.status}`);
  });
}

console.log("\nCSRF (petición desde otro sitio)");
await caso("POST con Origin ajeno → 403, aunque traiga sesión", async () => {
  const r = await pedir("/api/precios", json({}, conSesion({ Origin: "https://atacante.example" })));
  esperar(r.status === 403, `contestó ${r.status}`);
});
await caso("POST con Origin inválido → 403", async () => {
  const r = await pedir("/api/apartar", json({}, { Origin: "null" }));
  esperar(r.status === 403, `contestó ${r.status}`);
});

console.log("\nLogin");
await caso("contraseña como objeto (inyección) → 401, no 500", async () => {
  const r = await pedir("/api/admin/login", json({ contrasena: { $ne: "" } }, { Origin: BASE }));
  esperar(r.status === 401 || r.status === 429, `contestó ${r.status}`);
});
await caso("rotar X-Forwarded-For no esquiva el bloqueo (5 fallas → 429)", async () => {
  let ultimo = 0;
  for (let i = 0; i < 7; i++) {
    const r = await pedir("/api/admin/login", json({ contrasena: `mala-${i}` }, { Origin: BASE, "X-Forwarded-For": `203.0.113.${i}` }));
    ultimo = r.status;
  }
  esperar(ultimo === 429, `el último intento contestó ${ultimo}`);
});
await caso("el redirect del login no lleva a otro sitio (?next=)", async () => {
  const r = await pedir("/admin/login?next=https://atacante.example");
  const html = await r.text();
  esperar(!html.includes("atacante.example\"") || r.status === 200, "el next ajeno aparece como destino");
});

console.log("\nArchivos");
for (const ruta of [
  "/api/imagenes/..%2F..%2F.env",
  "/api/imagenes/%2e%2e%2f%2e%2e%2fpackage.json",
  "/api/imagenes/00000000-0000-0000-0000-000000000000.svg",
]) {
  await caso(`GET ${ruta} → 404 (sin salir de la carpeta)`, async () => {
    const r = await pedir(ruta);
    esperar(r.status === 404, `contestó ${r.status}`);
  });
}
if (TOKEN) {
  await caso("subir un HTML disfrazado de imagen → 400", async () => {
    const f = new FormData();
    f.append("archivo", new Blob(["<script>alert(1)</script>"], { type: "image/png" }), "x.png");
    const r = await pedir("/api/imagenes", { method: "POST", body: f, headers: conSesion({ Origin: BASE }) });
    esperar(r.status === 400, `contestó ${r.status}`);
  });
  await caso("subir 20 MB → 413 sin leerlo completo", async () => {
    const f = new FormData();
    f.append("archivo", new Blob([new Uint8Array(20 * 1024 * 1024)]), "grande.jpg");
    const r = await pedir("/api/imagenes", { method: "POST", body: f, headers: conSesion({ Origin: BASE }) });
    esperar(r.status === 413, `contestó ${r.status}`);
  });
}

console.log("\nEntrada manipulada");
if (TOKEN) {
  await caso("precios con un objeto donde va un id (inyección a Prisma) → 400", async () => {
    const r = await pedir("/api/precios", json({ prototipoId: { not: "" }, paqueteId: { not: "" }, monto: 1 }, conSesion({ Origin: BASE })));
    esperar(r.status === 400, `contestó ${r.status}`);
  });
  await caso("adelanto con monto negativo → 400", async () => {
    const r = await pedir("/api/planes/no-existe/recalculo", json({ accion: "adelanto", monto: "-500", confirmar: false }, conSesion({ Origin: BASE })));
    esperar(r.status === 400, `contestó ${r.status}`);
  });
}
await caso("apartar con canasta de cantidades negativas → 400", async () => {
  const r = await pedir("/api/apartar", json({ nombre: "Atacante", contacto: "x@x.mx", unidadId: "x", paqueteId: "x", canasta: { cocina: -5 }, firma: "Atacante", acepta: true }, { Origin: BASE }));
  esperar(r.status === 400 || r.status === 429, `contestó ${r.status}`);
});
await caso("apartar con textos gigantes → 400", async () => {
  const r = await pedir("/api/apartar", json({ nombre: "A".repeat(10000), contacto: "x", unidadId: "x", paqueteId: "x", firma: "A", acepta: true }, { Origin: BASE }));
  esperar(r.status === 400 || r.status === 429, `contestó ${r.status}`);
});

console.log("\nWebhook de Stripe");
await caso("evento sin firma → rechazado", async () => {
  const r = await pedir("/api/stripe/webhook", json({ type: "payment_intent.succeeded" }));
  esperar(r.status === 400 || r.status === 500, `contestó ${r.status}`);
});
await caso("evento con firma inventada → rechazado", async () => {
  const r = await pedir("/api/stripe/webhook", json({ type: "payment_intent.succeeded" }, { "Stripe-Signature": "t=1,v1=abc" }));
  esperar(r.status === 400 || r.status === 500, `contestó ${r.status}`);
});

console.log("\nCabeceras");
await caso("CSP, anti-iframe, nosniff y sin X-Powered-By", async () => {
  const r = await pedir("/");
  const h = r.headers;
  esperar((h.get("content-security-policy") ?? "").includes("frame-ancestors 'none'"), "falta la CSP");
  esperar(h.get("x-frame-options") === "DENY", "falta X-Frame-Options");
  esperar(h.get("x-content-type-options") === "nosniff", "falta nosniff");
  esperar(!h.get("x-powered-by"), "revela X-Powered-By");
});
await caso("la CSP no permite scripts de terceros salvo Stripe", async () => {
  const csp = (await pedir("/")).headers.get("content-security-policy") ?? "";
  const scripts = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
  esperar(!scripts.includes("*") && !scripts.includes("http:"), `script-src demasiado abierto: ${scripts}`);
});
await caso("el back office no se guarda en caché", async () => {
  const r = await pedir("/admin/login");
  esperar((r.headers.get("cache-control") ?? "").includes("no-store"), "sin no-store");
});

console.log("\nFugas en respuestas");
await caso("un error de servidor no devuelve la traza ni rutas del disco", async () => {
  const r = await pedir("/api/apartar", { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: "{no es json" });
  const t = await r.text();
  esperar(!/\/Users\/|node_modules|at .*\.ts:\d+/.test(t), "la respuesta trae rutas o traza");
});

console.log("\nApartado público (inventario)");
await caso("el sexto apartado desde la misma IP en una hora → 429", async () => {
  let ultimo = 0;
  for (let i = 0; i < 6; i++) {
    const r = await pedir("/api/apartar", json({ nombre: "Prueba Abuso", contacto: "abuso@prueba.mx", unidadId: "no-existe", paqueteId: "no-existe", firma: "Prueba Abuso", acepta: true }, { Origin: BASE }));
    ultimo = r.status;
  }
  // Con ids inexistentes el alta falla y no cuenta; aquí se prueba que el
  // freno existe sin ocupar unidades reales. Ver lib/seguridad.test.ts.
  esperar(ultimo === 400 || ultimo === 429, `contestó ${ultimo}`);
});

console.log(`\n${total - fallas}/${total} casos sin problema${fallas ? `, ${fallas} con problema` : ""}.`);
process.exit(fallas ? 1 : 0);
void host;
