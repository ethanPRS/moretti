# Seguridad · auditoría del 6 de octubre

Revisión completa del prototipo: autenticación y sesión, rutas públicas,
CSRF, entrada manipulada, archivos, webhook de Stripe, cabeceras, secretos y
dependencias. Rama `ethan/sprint-3`.

**Cómo se repite:**

```bash
npm test                                   # incluye lib/seguridad.test.ts
npx next build && npx next start -p 3109   # en otra terminal
node scripts/auditoria-seguridad.mjs http://localhost:3109 <token-admin>
```

El token se genera con `crearToken()` de `lib/sesion.ts` usando el
`SESSION_SECRET` del servidor. **Resultado del 6 de oct: 43 de 43 ataques
contenidos**, 180 pruebas en verde, `npm audit --omit=dev`: 0
vulnerabilidades. Se revisó además en el navegador que la CSP no rompe ni el
sitio ni el back office (consola sin errores).

## Lo que se encontró y se corrigió

| # | Gravedad | Hallazgo | Corrección |
|---|---|---|---|
| H-1 | **Crítica** | Next.js 16.3.4 tenía una ejecución remota de código (GHSA-vcvr-r3jv-pc5j); `sharp` y `source-map-js`, dos altas. | Next 16.3.8 y `npm audit fix`. En producción: 0 vulnerabilidades. Las 5 altas que reporta `npm audit` completo son del linter (`eslint-config-next` → `braces`), herramienta de desarrollo que no se despliega. |
| H-2 | **Alta** | `POST /api/apartar/anticipo` era pública y cobraba el anticipo de **cualquier** plan con sólo su id. Con la pasarela simulada lo marcaba pagado sin dinero: se podía apartar una unidad y congelar su precio gratis. | Ruta eliminada (el sitio ya cobra con el Payment Element de Stripe). |
| H-3 | **Alta** | `POST /api/apartar` (pública) no tenía freno: un script podía apartar todo el inventario con datos falsos, porque cada apartado ocupa la unidad. | 5 apartados por IP por hora (`limiteApartar`) y topes de longitud en todos los campos. Queda en revisión que un apartado sin anticipo expire (R-3). |
| H-4 | **Media** | El freno del login usaba `X-Forwarded-For`, que cualquiera escribe: cambiando el encabezado se probaban contraseñas sin límite. | La IP sólo se lee de ese encabezado con `CONFIAR_PROXY=1` (detrás de Vercel). Además, un tope global de 50 fallas en 15 minutos. |
| H-5 | **Media** | Sin política de contenido (CSP) ni HSTS. | CSP: sólo el propio sitio y Stripe; `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`. HSTS de dos años en producción. |
| H-6 | Media | `confirmarCobroStripe` se saltaba la máquina de estados y reabría planes cancelados (encontrado el 5 oct). | Corregido en Q (D-24). |
| H-7 | Media | `/api/paquetes`, `/api/precios` y `/api/contratos` pasaban el JSON tal cual a Prisma: un objeto en lugar de un id llega como filtro (en `precios`, el `updateMany` podía cerrar la vigencia de otros precios). | Validación estricta con `zod` en las tres (tipos y longitudes). |
| H-8 | Baja | La subida de imágenes leía el archivo completo antes de revisar el tamaño (memoria). | Se corta por `Content-Length` antes de leer. |

## Lo que ya estaba bien (y se probó)

- Toda la API del back office exige sesión (`proxy.ts`); sin ella, 401. Las
  páginas `/admin/*` mandan al login.
- La sesión es HMAC-SHA256 con secreto de ≥ 32 caracteres; un token alterado,
  de otra llave o vencido (8 h) no pasa. Cookie `HttpOnly`, `SameSite=Lax`,
  `Secure` en producción.
- Contraseña con scrypt y comparación en tiempo constante; el `?next=` del
  login sólo acepta rutas de `/admin` (sin redirección abierta).
- CSRF: toda petición que cambia algo y trae un `Origin` ajeno recibe 403,
  aunque traiga sesión.
- Archivos: el tipo se decide por el contenido (no por la extensión), los
  nombres son UUID y la lectura valida el nombre con una expresión estricta:
  no hay forma de salir de la carpeta. `nosniff` en cada imagen.
- Webhook: sin firma o con firma inventada, rechazado.
- Precios: el sitio nunca manda montos; el motor cotiza en el servidor.
- Sin `dangerouslySetInnerHTML`, sin SQL armado a mano en la aplicación
  (sólo en el vaciado de la base de pruebas, que se niega a correr fuera de
  `*_pruebas`).
- Sin secretos en el historial de git; `.env` y `almacen/` ignorados.
- Los errores 500 no devuelven trazas ni rutas del disco.

## Para revisar el miércoles con Charly (no se cambió)

| # | Riesgo | Por qué no se tocó | Propuesta |
|---|---|---|---|
| R-1 | `POST /api/stripe/create-payment-intent` exige sesión de admin, pero lo usa el **sitio público** al apartar: hoy el comprador recibiría 401. Abrirla sin más dejaría pedir el `client_secret` de cualquier exhibición. | Es código de Charly y cambia con D-34. | Hacerla pública **sólo para el anticipo de un plan recién apartado**: que `/api/apartar` devuelva un token de un solo uso firmado (plan + exhibición 0, 30 min) y que esta ruta lo exija. |
| R-2 | El webhook exige `event.account`: con D-34 los eventos llegan a la plataforma sin él y se rechazarían. Y la deduplicación hace `findUnique` y luego `create`: dos entregas simultáneas del mismo evento pueden pasar las dos. | Código de Charly. | Quitar el requisito de cuenta; deduplicar con el índice único de `EventoStripe.stripeEventId` (crear primero y tratar el choque como duplicado). |
| R-3 | Un apartado sin anticipo ocupa la unidad para siempre. | Decisión de negocio. | Que un plan COTIZADO sin anticipo se libere a las 24–48 h (proceso de Charly junto con el barrido de O). |
| R-4 | Un solo usuario de back office: quien opera también autoriza las transferencias a Moretti (D-34). | Falta el modelo de usuarios. | Usuarios con rol; «Pagos a Moretti» sólo para el rol de Ana Cris. Mientras, se registra el nombre de quien autoriza. |
| R-5 | La sesión no se puede revocar antes de que venza (8 h); cerrar sesión sólo borra la cookie. | Diseño del prototipo. | Rotar `SESSION_SECRET` invalida todas. Para producción, sesión en base o Auth.js. |
| R-6 | Los frenos viven en memoria: con varias instancias (serverless) cada una cuenta aparte. | Prototipo de un servidor. | Redis (Upstash) antes de producción. |
| R-7 | La CSP permite `'unsafe-inline'` en scripts porque Next lo necesita sin nonces. | Cambio mayor. | CSP con nonce desde `proxy.ts` cuando se vaya a producción. |
| R-8 | `pasarelaStripe` todavía no existe: el motor usa la pasarela simulada. Si se desplegara así, los cobros del back office se marcarían pagados sin dinero. | Charly. | No desplegar a un ambiente público hasta conectar `pasarelaStripe`; agregar un candado que impida la falsa con `NODE_ENV=production`. |

## Variables de entorno de seguridad

| Variable | Para qué |
|---|---|
| `SESSION_SECRET` | Firma de la sesión. Mínimo 32 caracteres (`openssl rand -hex 32`). Rotarla cierra todas las sesiones. |
| `ADMIN_PASSWORD_HASH` | `scrypt:<sal>:<hash>`; se genera con `node scripts/hash-contrasena.mjs`. |
| `CONFIAR_PROXY` | `1` sólo detrás de un proxy que sobrescribe `X-Forwarded-For` (Vercel). |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Sólo `sk_test_` en el prototipo (las rutas lo verifican). |
