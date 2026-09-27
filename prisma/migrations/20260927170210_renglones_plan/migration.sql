-- CreateEnum
CREATE TYPE "ModalidadPlan" AS ENUM ('PAQUETE', 'A_LISTA', 'ARMA_EL_TUYO');

-- CreateEnum
CREATE TYPE "OrigenRenglon" AS ENUM ('PAQUETE', 'AGREGADA');

-- AlterTable
ALTER TABLE "Exhibicion" ADD COLUMN     "intentosRechazados" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "modalidad" "ModalidadPlan" NOT NULL DEFAULT 'PAQUETE',
ALTER COLUMN "precioId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Proyecto" ADD COLUMN     "minimoPlan" DECIMAL(12,2) NOT NULL DEFAULT 50000;

-- CreateTable
CREATE TABLE "RenglonPlan" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "partidaId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioLista" DECIMAL(12,2) NOT NULL,
    "precioCongelado" DECIMAL(12,2) NOT NULL,
    "origen" "OrigenRenglon" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenglonPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RenglonPlan_planId_partidaId_origen_key" ON "RenglonPlan"("planId", "partidaId", "origen");

-- AddForeignKey
ALTER TABLE "RenglonPlan" ADD CONSTRAINT "RenglonPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenglonPlan" ADD CONSTRAINT "RenglonPlan_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "Partida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Datos (S1-02). Todo lo de abajo lo escribió Ethan a mano; lo de arriba lo
-- generó Prisma. En una base vacía (reset + seed) no hace nada.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Precio de lista de la cocina (docs/decisiones.md, D-04). La maqueta no lo
--    trae: se deriva del paquete cerrado que contiene la cocina (Casa Lista),
--    restándole a su precio vigente las otras partidas a lista. Sólo donde
--    todas esas partidas tienen precio; si falta alguna no se inventa nada y
--    la verificación del final lo reporta.
INSERT INTO "PrecioPartida" ("id", "prototipoId", "partidaId", "monto")
SELECT gen_random_uuid()::text, vigente."prototipoId", cocina."id",
       vigente."monto" - SUM(pp."monto")
FROM "Partida" cocina
JOIN "_PaqueteToPartida" con_cocina ON con_cocina."B" = cocina."id"
JOIN "Paquete" paq ON paq."id" = con_cocina."A" AND NOT paq."esArmable"
JOIN LATERAL (
  SELECT DISTINCT ON (pr."prototipoId") pr."prototipoId", pr."monto"
  FROM "Precio" pr
  WHERE pr."paqueteId" = paq."id" AND pr."vigenteHasta" IS NULL
  ORDER BY pr."prototipoId", pr."vigenteDesde" DESC
) vigente ON TRUE
JOIN "_PaqueteToPartida" otras ON otras."A" = paq."id" AND otras."B" <> cocina."id"
LEFT JOIN "PrecioPartida" pp ON pp."prototipoId" = vigente."prototipoId" AND pp."partidaId" = otras."B"
WHERE cocina."clave" = 'cocina'
  AND NOT EXISTS (
    SELECT 1 FROM "PrecioPartida" ya
    WHERE ya."prototipoId" = vigente."prototipoId" AND ya."partidaId" = cocina."id"
  )
GROUP BY vigente."prototipoId", cocina."id", vigente."monto"
HAVING bool_and(pp."monto" IS NOT NULL) AND vigente."monto" - SUM(pp."monto") > 0;

-- 2. Los planes que ya existen (el DU-001 del seed) eran un paquete cerrado sin
--    cambios: sus renglones son lo que trae el paquete, acumulado, con los
--    climas del prototipo. El precio congelado se reparte en proporción a la
--    lista, al peso, y la última partida por orden absorbe el redondeo (D-05):
--    lo mismo que hace `cotizar` en lib/motor/canasta.ts. La prueba
--    prisma/migraciones.int.test.ts compara los dos caminos.
CREATE TEMP TABLE "_planes_a_migrar" ON COMMIT DROP AS
SELECT pl."id", pl."montoCongelado"
FROM "Plan" pl
JOIN "Paquete" paq ON paq."id" = pl."paqueteId" AND NOT paq."esArmable"
WHERE NOT EXISTS (SELECT 1 FROM "RenglonPlan" r WHERE r."planId" = pl."id");

CREATE TEMP TABLE "_contenido_a_migrar" ON COMMIT DROP AS
SELECT DISTINCT pl."id" AS plan_id, pa."id" AS partida_id, pa."clave", pa."orden",
       CASE WHEN pa."porEquipo" THEN proto."climasDefault" ELSE 1 END AS cantidad,
       pp."monto" AS precio_lista, pl."montoCongelado" AS total, proto."clave" AS prototipo
FROM "_planes_a_migrar" m
JOIN "Plan" pl ON pl."id" = m."id"
JOIN "Paquete" paq ON paq."id" = pl."paqueteId"
JOIN "Comprador" c ON c."id" = pl."compradorId"
JOIN "Unidad" u ON u."id" = c."unidadId"
JOIN "Prototipo" proto ON proto."id" = u."prototipoId"
JOIN "Paquete" hasta ON NOT hasta."esArmable" AND hasta."nivel" <= paq."nivel"
JOIN "_PaqueteToPartida" incluye ON incluye."A" = hasta."id"
JOIN "Partida" pa ON pa."id" = incluye."B"
LEFT JOIN "PrecioPartida" pp ON pp."prototipoId" = proto."id" AND pp."partidaId" = pa."id";

-- Sin precio de lista no hay con qué repartir: se detiene todo en vez de
-- repartir el precio entre las partidas que sí tienen (la suma cuadraría y
-- el plan quedaría con partidas de menos sin que nadie lo notara).
DO $$
DECLARE faltantes TEXT;
BEGIN
  SELECT string_agg(DISTINCT prototipo || ' · ' || clave, ', ') INTO faltantes
  FROM "_contenido_a_migrar" WHERE precio_lista IS NULL AND cantidad > 0;
  IF faltantes IS NOT NULL THEN
    RAISE EXCEPTION 'S1-02: no se pueden migrar los planes existentes porque falta el precio de lista de: %. Cárgalo en PrecioPartida y vuelve a correr la migración.', faltantes;
  END IF;
END $$;

WITH pesos AS (
  SELECT *, precio_lista * cantidad AS peso,
         SUM(precio_lista * cantidad) OVER (PARTITION BY plan_id) AS peso_total,
         ROW_NUMBER() OVER (PARTITION BY plan_id ORDER BY orden DESC) AS desde_el_final
  FROM "_contenido_a_migrar"
  WHERE cantidad > 0
),
partes AS (
  SELECT *, ROUND(total * peso / peso_total, 0) AS parte FROM pesos
)
INSERT INTO "RenglonPlan" ("id", "planId", "partidaId", "cantidad", "precioLista", "precioCongelado", "origen")
SELECT gen_random_uuid()::text, plan_id, partida_id, cantidad, precio_lista,
       CASE WHEN desde_el_final = 1
            THEN total - (SUM(parte) OVER (PARTITION BY plan_id) - parte)
            ELSE parte END,
       'PAQUETE'
FROM partes;

-- 3. La bitácora es append-only: cada plan migrado deja su evento.
INSERT INTO "Evento" ("id", "entidadTipo", "entidadId", "tipo", "comentario", "usuario")
SELECT gen_random_uuid()::text, 'plan', m."id", 'plan_migrado_a_renglones',
       'Migración del 27 de septiembre (S1-02): lo vendido se guardó partida por partida. El precio congelado no cambió: $'
         || to_char(m."montoCongelado", 'FM999,999,990') || '.',
       'migracion'
FROM "_planes_a_migrar" m;

-- 4. Verificaciones. Si algo no cuadra, la migración entera se revierte.
DO $$
DECLARE
  sin_renglones INTEGER;
  descuadrados  INTEGER;
  en_cero       INTEGER;
BEGIN
  SELECT COUNT(*) INTO sin_renglones FROM "Plan" p
  WHERE NOT EXISTS (SELECT 1 FROM "RenglonPlan" r WHERE r."planId" = p."id");
  IF sin_renglones > 0 THEN
    RAISE EXCEPTION 'S1-02: % plan(es) quedaron sin renglones. Revisa que su prototipo tenga precio de lista para cada partida del paquete (incluida la cocina).', sin_renglones;
  END IF;

  SELECT COUNT(*) INTO descuadrados FROM "Plan" p
  WHERE p."montoCongelado" <> (SELECT SUM(r."precioCongelado") FROM "RenglonPlan" r WHERE r."planId" = p."id");
  IF descuadrados > 0 THEN
    RAISE EXCEPTION 'S1-02 / R7: en % plan(es) la suma de los renglones no es el monto congelado.', descuadrados;
  END IF;

  SELECT COUNT(*) INTO en_cero FROM "RenglonPlan" WHERE "precioCongelado" <= 0 OR "cantidad" <= 0;
  IF en_cero > 0 THEN
    RAISE EXCEPTION 'S1-02: % renglón(es) quedaron en cero o negativos.', en_cero;
  END IF;
END $$;
