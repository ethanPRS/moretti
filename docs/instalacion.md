# Instalación

Para alguien que no participó en el proyecto. Al terminar tendrás el sitio
en `http://localhost:3000`, el back office en `/admin` y las pruebas en verde.
Probado desde un clon limpio el 6 de octubre de 2026 (ver el final).

## 1. Lo que necesitas

| Herramienta | Versión probada | Para qué |
|---|---|---|
| Node.js | 24 (mínimo 20.9) | Next.js 16 |
| PostgreSQL | 16 | La base (en Mac: Postgres.app o `brew install postgresql@16`) |
| Git | cualquiera | Clonar |

Stripe **no** es necesario para levantarlo: sin llaves, el motor usa la
pasarela simulada.

## 2. Pasos

```bash
git clone https://github.com/ethanPRS/moretti.git
cd moretti                  # la raíz del repo es el prototipo (ahí está package.json)
npm ci                      # instala exactamente lo del package-lock

cp .env.example .env
```

Edita `.env`:

1. `DATABASE_URL`: cambia `TU_USUARIO` por tu usuario de Postgres
   (en Mac suele ser tu usuario del sistema; `whoami`).
2. La contraseña del back office, **como hash**:
   ```bash
   node scripts/hash-contrasena.mjs 'elige-una-contraseña'
   ```
   Copia la línea `scrypt:…` en `ADMIN_PASSWORD_HASH`.
3. `SESSION_SECRET`: `openssl rand -hex 32`.

Crea las bases y siembra el catálogo:

```bash
createdb moretti_dev
createdb moretti_pruebas    # la usan las pruebas de integración; se vacía en cada prueba
npx prisma migrate reset    # crea las tablas (12 migraciones) y siembra la maqueta
npx tsx --env-file=.env scripts/completar-unidades.ts   # unidades libres para apartar
```

Arranca:

```bash
npm run dev                 # http://localhost:3000 · back office en /admin
```

## 3. Comprobar que quedó bien

```bash
npm test                    # 180 pruebas: unitarias + integración
npx next typegen            # genera los tipos de rutas que usa tsc (lo hace también build)
npx tsc --noEmit            # tipos
npm run lint
npm run build               # compilación de producción
```

Prueba de humo a mano:

1. `http://localhost:3000/cotizar` → elige desarrollo, prototipo y paquete.
2. `http://localhost:3000/admin` → entra con tu contraseña.
3. En un proyecto, una unidad libre → «Dar de alta» → registra el contrato →
   «Cobrar anticipo». La unidad pasa a Apartado y aparece un comprobante en
   «Fiscal».

## 4. Variables de entorno

| Variable | Obligatoria | Qué es |
|---|---|---|
| `DATABASE_URL` | sí | Postgres de desarrollo. |
| `DATABASE_URL_PRUEBAS` | no | Base de las pruebas; por defecto `…_pruebas`. Tiene que terminar en `_pruebas` o `_test`. |
| `ADMIN_PASSWORD_HASH` | sí | Hash scrypt de la contraseña del back office. |
| `SESSION_SECRET` | sí | Mínimo 32 caracteres. |
| `ALMACEN_LOCAL_DIR` | no | Dónde se guardan fotos e imágenes (por defecto `./almacen`). |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | no | Sólo llaves de **prueba** (`pk_test_`, `sk_test_`). Sin ellas se usa la pasarela simulada. |
| `CONFIAR_PROXY` | no | `1` sólo detrás de Vercel u otro proxy que fije `X-Forwarded-For` (docs/seguridad.md). |
| `FERIADOS_FISCALES` | no | Feriados del SAT además de los de ley, `AAAA-MM-DD,AAAA-MM-DD`. |

## 5. Problemas comunes

| Síntoma | Causa y arreglo |
|---|---|
| `The column … does not exist` | Falta aplicar migraciones: `npx prisma migrate deploy` (o `reset` en desarrollo). |
| Después de una migración, error raro en el servidor | El `npm run dev` que ya corría tiene el cliente de Prisma viejo: reinícialo. |
| «Las pruebas de integración no corren contra …» | `DATABASE_URL_PRUEBAS` no termina en `_pruebas`: es un candado para no vaciar tu base. |
| «El acceso no está configurado en el servidor» al entrar | Falta `ADMIN_PASSWORD_HASH` o `SESSION_SECRET`. |
| `$` en `ADMIN_PASSWORD_HASH` se pierde | Usa el formato `scrypt:` del script (sin `$`); Next expande `$` en `.env`. |
| Solo un `next dev` por carpeta | Next 16 no deja dos servidores de desarrollo en la misma carpeta. Usa otro puerto o un `git worktree`. |

## 6. Comprobación desde un clon limpio (6 oct)

Se clonó la rama `ethan/sprint-3` en una carpeta nueva, con bases nuevas
(`moretti_clon_dev`, `moretti_clon_pruebas`), siguiendo sólo este documento:
`npm ci`, `.env` desde el ejemplo (hash y secreto con los comandos de arriba),
`createdb`, `migrate reset` (12 migraciones y la siembra),
`completar-unidades` y `npm test`: **180 de 180 pruebas en verde**.

Dos ajustes que salieron de esa prueba y ya están arriba: la raíz del repo es
la carpeta del prototipo, y `tsc` necesita `next typegen` (o un build) antes.
El `npm run build` del clon no terminó porque el disco de la máquina se llenó;
el mismo build sí pasó en la carpeta de trabajo.
