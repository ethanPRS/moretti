/**
 * Lo que el cotizador del sitio necesita del motor, sin depender de Prisma:
 * es un componente de cliente y no puede cargar Decimal.
 */

const PLAZO = 12;

// El mínimo para financiar ya no vive aquí: es Proyecto.minimoPlan (S1-03).

/**
 * Gemelo en enteros de `calcularExhibiciones`.
 *
 * El porcentaje llega en puntos base (30 % = 3000) para que la multiplicación
 * sea exacta en punto flotante: precio × 3000 cabe de sobra en un entero
 * seguro, y sólo después se divide. Multiplicar por 0.30 directo sí puede
 * caer del lado equivocado del redondeo.
 *
 * `planes.test.ts` comprueba que los dos caminos dan lo mismo en todos los
 * precios del catálogo. Si alguien cambia uno y no el otro, la prueba truena.
 */
export function calcularExhibicionesEnteras(precio: number, anticipoBP: number) {
  const anticipo = Math.round((precio * anticipoBP) / 10000);
  const financiado = precio - anticipo;
  const mensualidad = Math.round(financiado / PLAZO);
  const ultima = financiado - mensualidad * (PLAZO - 1);

  return {
    anticipo,
    mensualidad,
    ultima,
    total: precio,
  };
}
