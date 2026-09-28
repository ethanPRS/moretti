# día uno · prototipo

Sistema de venta, cobranza y operación del programa día uno con Moretti:
cotizador del sitio, back office (`/admin`) y el motor de planes y cobros.
Next.js 16 + PostgreSQL + Prisma. Trabajo de clase, siempre contra el modo de
pruebas de Stripe y con datos inventados.

## Arrancar

```bash
npm install
cp .env.example .env            # si no tienes .env: DATABASE_URL de tu Postgres local
npx prisma migrate reset        # crea la base, aplica migraciones y siembra el catálogo y DU-001
npm run dev                     # http://localhost:3000 · back office en /admin
```

Después de cada migración, **reinicia `npm run dev`**: el servidor que ya
corría se queda con el cliente de Prisma viejo.

## Comprobar

```bash
npm test          # unitarias + integración (ver docs/pruebas.md)
npx tsc --noEmit  # tipos
npm run lint
npm run build
```

## Dónde está qué

| Carpeta | Qué |
|---|---|
| `lib/motor/` | Las reglas: cotizar canastas, generar planes, cobrar, estados. Aquí vive el negocio. |
| `lib/pasarela/` | El contrato con la pasarela de pagos y la pasarela falsa. La de Stripe es de Charly. |
| `lib/almacenamiento/` | Dónde se guardan las fotos de referencia (hoy, disco local en `almacen/`). |
| `prisma/` | Esquema, migraciones, catálogo de la maqueta y seed. |
| `app/(sitio)/` | Lo que ve el comprador. |
| `app/admin/` | El back office. |
| `docs/` | Decisiones, reglas, modelo de datos, parámetros, pruebas y los documentos de cada sprint. Empieza por [`docs/README.md`](docs/README.md). |
