-- Cobro fuera de sesión de las mensualidades: el barrido de vencidas y los
-- reintentos según el motivo del rechazo. Sólo agrega columnas con default;
-- ningún dato existente cambia.

ALTER TABLE "Exhibicion"
  ADD COLUMN "rechazosConTarjeta" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "proximoIntentoEn" TIMESTAMP(3),
  ADD COLUMN "requiereTarjetaNueva" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cobroPendienteDesde" TIMESTAMP(3),
  ADD COLUMN "bloqueadaHasta" TIMESTAMP(3);

CREATE INDEX "Exhibicion_estado_fechaProgramada_idx" ON "Exhibicion"("estado", "fechaProgramada");
