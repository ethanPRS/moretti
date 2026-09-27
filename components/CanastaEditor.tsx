"use client";

import { MAX_POR_EQUIPO, type Canasta, type PartidaDelCatalogo } from "@/lib/motor/canasta";

const mx = (n: number) => "$" + n.toLocaleString("es-MX");

/**
 * La lista de partidas con casilla (o contador, en los climas). La usan el
 * cotizador del sitio y el alta del back office: es «la misma lista del
 * cotizador» que pide S1-04.
 *
 * Con `incluidas` (lo que trae un paquete cerrado) marca qué viene en el
 * paquete y qué se agrega a lista.
 */
export default function CanastaEditor({
  partidas,
  canasta,
  onCambiar,
  climasDefault,
  incluidas,
  acento = "warm",
}: {
  partidas: PartidaDelCatalogo[];
  canasta: Canasta;
  onCambiar: (clave: string, cantidad: number) => void;
  climasDefault: number;
  incluidas?: Record<string, number>;
  acento?: "warm" | "accent";
}) {
  const ajustar = (clave: string, cantidad: number) =>
    onCambiar(clave, Math.max(0, Math.min(MAX_POR_EQUIPO, cantidad)));

  return (
    <ul className="flex flex-col divide-y divide-line rounded-card border border-line">
      {partidas.map((p) => {
        const cantidad = canasta[p.clave] ?? 0;
        const precio = p.precioLista ?? 0;
        const enPaquete = incluidas?.[p.clave] ?? 0;
        return (
          <li key={p.clave} className="flex items-center gap-3 px-3.5 py-2.5">
            {p.porEquipo ? (
              <div className="flex items-center gap-1.5" aria-label={`Cantidad de ${p.nombre}`}>
                <button
                  type="button"
                  className="grid h-7 w-7 place-items-center rounded-full border border-line-2 text-ink-2 hover:bg-surface-2 disabled:opacity-40"
                  onClick={() => ajustar(p.clave, cantidad - 1)}
                  disabled={cantidad === 0}
                  aria-label="Quitar uno"
                >
                  −
                </button>
                <span className="w-5 text-center font-semibold tabular-nums">{cantidad}</span>
                <button
                  type="button"
                  className="grid h-7 w-7 place-items-center rounded-full border border-line-2 text-ink-2 hover:bg-surface-2 disabled:opacity-40"
                  onClick={() => ajustar(p.clave, cantidad + 1)}
                  disabled={cantidad >= MAX_POR_EQUIPO}
                  aria-label="Agregar uno"
                >
                  +
                </button>
              </div>
            ) : (
              <input
                type="checkbox"
                id={`partida-${p.clave}`}
                checked={cantidad > 0}
                onChange={(e) => ajustar(p.clave, e.target.checked ? 1 : 0)}
                className={`h-[18px] w-[18px] shrink-0 ${acento === "warm" ? "accent-[var(--warm)]" : "accent-[var(--accent)]"}`}
              />
            )}
            <label
              htmlFor={p.porEquipo ? undefined : `partida-${p.clave}`}
              className={`flex-1 text-[14.5px] ${cantidad > 0 ? "text-ink" : "text-muted"}`}
            >
              {p.nombre}
              {p.porEquipo && (
                <span className="block text-[12px] text-muted">
                  {mx(precio)} por equipo · el depa trae {climasDefault}
                  {enPaquete > 0 && ` · ${enPaquete} en el paquete`}
                </span>
              )}
              {!p.porEquipo && incluidas && (
                <span className="block text-[12px] text-muted">
                  {enPaquete > 0 ? "Viene en el paquete" : "Se agrega a precio de lista"}
                </span>
              )}
            </label>
            <span className={`text-[13.5px] tabular-nums ${cantidad > 0 ? "text-ink" : "text-muted"}`}>
              {mx(precio * Math.max(cantidad, p.porEquipo ? 0 : 1))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
