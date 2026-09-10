import { Prisma } from "@prisma/client";

const { Decimal } = Prisma;

export const PLAZO = 12;

/** Descuento por liquidar de contado desde el arranque (parámetro comercial). */
export const DESCUENTO_CONTADO = 0.08;

/**
 * Reparte el precio en anticipo + doce exhibiciones (spec §4).
 * R7: la suma tiene que cuadrar al peso — el redondeo se absorbe en la
 * exhibición 12, no se reparte.
 */
export function calcularExhibiciones(
  precio: Prisma.Decimal,
  porcentajeAnticipo: Prisma.Decimal
) {
  const anticipo = precio.mul(porcentajeAnticipo).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const financiado = precio.sub(anticipo);
  const mensualidad = financiado.div(PLAZO).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const ultima = financiado.sub(mensualidad.mul(PLAZO - 1));

  return [
    { numero: 0, monto: anticipo },
    ...Array.from({ length: PLAZO - 1 }, (_, i) => ({
      numero: i + 1,
      monto: mensualidad,
    })),
    { numero: PLAZO, monto: ultima },
  ];
}
