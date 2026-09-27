"use client";

import { useMemo, useState } from "react";
import { calcularExhibicionesEnteras, MINIMO_PLAN } from "@/lib/motor/enteros";

export type Cotizacion = {
  paqueteId: string;
  paqueteNombre: string;
  nivel: number;
  total: number;
  anticipo: number;
  mensualidad: number;
  contado: number;
  ahorro: number;
};

/** Una partida que se puede marcar en «Arma el tuyo», con su precio de lista. */
export type PartidaArmable = {
  clave: string;
  nombre: string;
  familia: "A_LA_MEDIDA" | "DE_CATALOGO" | "VALE";
  porEquipo: boolean;
  porDefecto: boolean;
  precio: number;
};

export type Desarrollo = {
  id: string;
  nombre: string;
  anticipoBP: number;
  prototipos: {
    id: string;
    clave: string;
    superficie: number;
    recamaras: number;
    climasDefault: number;
    partidas: PartidaArmable[];
    cotizaciones: Cotizacion[];
  }[];
};

type PaqueteArmable = { id: string; nombre: string; nivel: number };

const mx = (n: number) => "$" + n.toLocaleString("es-MX");

/** Spec §4: arranca con clósets y carpintería marcados; los climas, los del prototipo. */
function canastaInicial(partidas: PartidaArmable[], climasDefault: number) {
  return Object.fromEntries(
    partidas.map((p) => [p.clave, p.porEquipo ? climasDefault : p.porDefecto ? 1 : 0])
  ) as Record<string, number>;
}

export default function Cotizador({
  desarrollos,
  armable,
  descuentoContado,
}: {
  desarrollos: Desarrollo[];
  armable: PaqueteArmable | null;
  descuentoContado: number;
}) {
  const [desarrolloId, setDesarrolloId] = useState(desarrollos[0]?.id ?? "");
  const [prototipoId, setPrototipoId] = useState(
    desarrollos[0]?.prototipos[0]?.id ?? ""
  );
  const [nivel, setNivel] = useState(1);
  // Cantidad por partida en «Arma el tuyo». Se reinicia al cambiar de depa,
  // porque los climas por defecto y los precios a la medida cambian.
  const [canasta, setCanasta] = useState<Record<string, number>>(() => {
    const p = desarrollos[0]?.prototipos[0];
    return p ? canastaInicial(p.partidas, p.climasDefault) : {};
  });

  const desarrollo = useMemo(
    () => desarrollos.find((d) => d.id === desarrolloId) ?? desarrollos[0],
    [desarrollos, desarrolloId]
  );

  const prototipo = useMemo(
    () =>
      desarrollo?.prototipos.find((p) => p.id === prototipoId) ??
      desarrollo?.prototipos[0],
    [desarrollo, prototipoId]
  );

  const armando = armable !== null && nivel === armable.nivel;

  const cotizacionArmada = useMemo((): Cotizacion | null => {
    if (!armable || !prototipo || !desarrollo) return null;
    // Σ lista(partida × cantidad). Los precios ya vienen redondeados a la centena.
    const total = prototipo.partidas.reduce(
      (acc, p) => acc + p.precio * (canasta[p.clave] ?? 0),
      0
    );
    const { anticipo, mensualidad } = calcularExhibicionesEnteras(total, desarrollo.anticipoBP);
    const contado = Math.round(total * (1 - descuentoContado));
    return {
      paqueteId: armable.id,
      paqueteNombre: armable.nombre,
      nivel: armable.nivel,
      total,
      anticipo,
      mensualidad,
      contado,
      ahorro: total - contado,
    };
  }, [armable, prototipo, desarrollo, canasta, descuentoContado]);

  const cotizacion = useMemo(
    () =>
      armando
        ? cotizacionArmada
        : (prototipo?.cotizaciones.find((c) => c.nivel === nivel) ??
          prototipo?.cotizaciones[0]),
    [prototipo, nivel, armando, cotizacionArmada]
  );

  if (!desarrollo || !prototipo || !cotizacion) {
    return (
      <p className="note">
        Todavía no hay precios cargados para cotizar. Cárgalos desde el back office.
      </p>
    );
  }

  function cambiarPrototipo(id: string, lista = desarrollo.prototipos) {
    setPrototipoId(id);
    const p = lista.find((x) => x.id === id);
    if (p) setCanasta(canastaInicial(p.partidas, p.climasDefault));
  }

  function cambiarDesarrollo(id: string) {
    setDesarrolloId(id);
    const siguiente = desarrollos.find((d) => d.id === id);
    if (siguiente?.prototipos[0]) cambiarPrototipo(siguiente.prototipos[0].id, siguiente.prototipos);
  }

  function ajustar(clave: string, cantidad: number) {
    setCanasta((c) => ({ ...c, [clave]: Math.max(0, Math.min(9, cantidad)) }));
  }

  const opciones = [
    ...prototipo.cotizaciones.map((c) => ({ nivel: c.nivel, nombre: c.paqueteNombre })),
    ...(armable ? [{ nivel: armable.nivel, nombre: armable.nombre }] : []),
  ];
  const financiable = cotizacion.total >= MINIMO_PLAN;
  const conMedida = prototipo.partidas.some(
    (p) => p.familia === "A_LA_MEDIDA" && (canasta[p.clave] ?? 0) > 0
  );

  return (
    <div className="card grid overflow-clip md:grid-cols-2">
      <div className="flex flex-col gap-6 p-7 sm:p-9">
        <div className="field">
          <label htmlFor="desarrollo">Desarrollo</label>
          <select
            id="desarrollo"
            value={desarrollo.id}
            onChange={(e) => cambiarDesarrollo(e.target.value)}
          >
            {desarrollos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="prototipo">Tu departamento</label>
          <select
            id="prototipo"
            value={prototipo.id}
            onChange={(e) => cambiarPrototipo(e.target.value)}
          >
            {desarrollo.prototipos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.clave}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[14.5px] text-muted">
            {prototipo.superficie} m² ·{" "}
            {prototipo.recamaras === 1
              ? "1 recámara"
              : `${prototipo.recamaras} recámaras`}
          </p>
        </div>

        <div className="field">
          <span>Paquete</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {opciones.map((o) => {
              const esArmable = armable?.nivel === o.nivel;
              const activo = o.nivel === cotizacion.nivel;
              return (
                <button
                  key={o.nivel}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => setNivel(o.nivel)}
                  className={`rounded-full border px-2 py-2.5 text-[13.5px] font-semibold transition-colors ${
                    esArmable ? "col-span-2 sm:col-span-4" : ""
                  } ${
                    activo
                      ? esArmable
                        ? "border-warm bg-warm text-ground"
                        : "border-accent bg-accent text-ground"
                      : esArmable
                        ? "border-dashed border-warm/60 bg-warm-soft text-warm hover:border-warm"
                        : "border-line-2 bg-surface text-ink-2 hover:bg-surface-2"
                  }`}
                >
                  {esArmable ? `✳ ${o.nombre}` : o.nombre}
                </button>
              );
            })}
          </div>
        </div>

        {armando && (
          <fieldset>
            <legend className="label mb-2">Marca lo que quieras · sin cocina</legend>
            <ul className="flex flex-col divide-y divide-line rounded-card border border-line">
              {prototipo.partidas.map((p) => {
                const cantidad = canasta[p.clave] ?? 0;
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
                          className="grid h-7 w-7 place-items-center rounded-full border border-line-2 text-ink-2 hover:bg-surface-2"
                          onClick={() => ajustar(p.clave, cantidad + 1)}
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
                        className="h-[18px] w-[18px] shrink-0 accent-[var(--warm)]"
                      />
                    )}
                    <label
                      htmlFor={p.porEquipo ? undefined : `partida-${p.clave}`}
                      className={`flex-1 text-[14.5px] ${cantidad > 0 ? "text-ink" : "text-muted"}`}
                    >
                      {p.nombre}
                      {p.porEquipo && (
                        <span className="block text-[12px] text-muted">
                          {mx(p.precio)} por equipo · tu depa trae {prototipo.climasDefault}
                        </span>
                      )}
                    </label>
                    <span className={`text-[13.5px] tabular-nums ${cantidad > 0 ? "text-ink" : "text-muted"}`}>
                      {mx(p.precio * Math.max(cantidad, p.porEquipo ? 0 : 1))}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[12.5px] text-muted">
              Precios de lista por pieza para tu prototipo. ¿Quieres cocina? Elige un
              paquete cerrado.
            </p>
            {/* En celular el resumen queda debajo de todo: el subtotal va aquí a la vista. */}
            <p className="mt-3 flex items-baseline justify-between rounded-card bg-warm-soft px-3.5 py-2.5 md:hidden">
              <span className="text-[13px] text-ink-2">Llevas</span>
              <b className="figure text-[19px] text-warm">{mx(cotizacion.total)}</b>
            </p>
            {/* Spec §4: sólo se agenda levantamiento si algo se fabrica a la medida. */}
            <p className="mt-1.5 text-[12.5px] text-ink-2">
              {conMedida
                ? "Incluye levantamiento en obra: medimos tu depa antes de fabricar."
                : "Sin levantamiento: todo lo que marcaste es de catálogo."}
            </p>
          </fieldset>
        )}

        <p className="mt-auto border-t border-line pt-5 text-[14.5px] text-ink-2">
          Sin intereses y sin trámite de crédito. El precio queda congelado cuando das
          tu anticipo, aunque la entrega sea hasta 2028.
        </p>
      </div>

      <div className="border-t border-line bg-surface-2 p-7 sm:p-9 md:border-l md:border-t-0">
        {/* Pegajoso: al armar la canasta la lista es larga y el total tiene que seguir a la vista. */}
        <div className="flex h-full flex-col md:sticky md:top-24 md:h-auto">
        <p className="label">Paquete {cotizacion.paqueteNombre}</p>
        <p className="figure mt-2 text-[clamp(38px,5.5vw,54px)] leading-none">
          {mx(cotizacion.total)}
        </p>
        <p className="mt-2 text-[14.5px] text-muted">+ IVA · instalado</p>

        {financiable ? (
          <>
            <div className="mt-7 grid grid-cols-2 gap-5 border-t border-line-2 pt-6">
              <div>
                <p className="label">Apartas con</p>
                <p className="figure mt-1.5 text-[26px]">{mx(cotizacion.anticipo)}</p>
              </div>
              <div>
                <p className="label">12 mensualidades de</p>
                <p className="figure mt-1.5 text-[26px]">{mx(cotizacion.mensualidad)}</p>
              </div>
            </div>

            <div className="mt-6 rounded-brand bg-warm-soft px-4 py-3.5 text-[14.5px] text-ink-2">
              Si lo liquidas de contado: <b className="text-warm">{mx(cotizacion.contado)}</b>{" "}
              · ahorras <b className="text-warm">{mx(cotizacion.ahorro)}</b>
            </div>
          </>
        ) : (
          <div className="mt-7 border-t border-line-2 pt-6">
            <p className="text-[15px] text-ink-2">
              <b className="text-ink">Se paga de contado en un solo pago.</b> El plan a 12
              meses arranca desde {mx(MINIMO_PLAN)}.
            </p>
            {cotizacion.total > 0 && (
              <p className="mt-2 text-[14px] text-muted">
                Te faltan {mx(MINIMO_PLAN - cotizacion.total)} para poder pagarlo en
                mensualidades.
              </p>
            )}
          </div>
        )}

        <div className="mt-auto pt-7">
          <a href="#como" className="btn w-full text-center">
            Quiero apartarlo
          </a>
          <p className="mt-3.5 text-[13px] text-muted">
            Cotización informativa. El precio se confirma y se congela al firmar tu
            contrato con Moretti.
          </p>
        </div>
        </div>
      </div>
    </div>
  );
}
