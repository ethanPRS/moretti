"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { calcularExhibicionesEnteras } from "@/lib/motor/enteros";
import {
  canastaInicialArmaElTuyo,
  cotizarEnCatalogo,
  esFinanciable,
  type Canasta,
  type PaqueteArmable,
  type ProyectoCotizable,
  type PrototipoCotizable,
} from "@/lib/motor/canasta";
import { ReglaError } from "@/lib/motor/errores";
import CanastaEditor from "@/components/CanastaEditor";
import { ContenidoBoton } from "@/components/Boton";

/** Un desarrollo con sus prototipos, tal como lo arma lib/motor/catalogo.ts. */
export type Desarrollo = ProyectoCotizable & { prototipos: PrototipoCotizable[] };

const mx = (n: number) => "$" + n.toLocaleString("es-MX");

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
  const [prototipoId, setPrototipoId] = useState(desarrollos[0]?.prototipos[0]?.id ?? "");
  const [nivel, setNivel] = useState(1);
  // Cantidad por partida en «Arma el tuyo». Se reinicia al cambiar de depa,
  // porque los climas por defecto y los precios a la medida cambian.
  const [canasta, setCanasta] = useState<Canasta>(() => {
    const p = desarrollos[0]?.prototipos[0];
    return p ? canastaInicialArmaElTuyo(p.partidas, p.climasDefault) : {};
  });

  const desarrollo = useMemo(
    () => desarrollos.find((d) => d.id === desarrolloId) ?? desarrollos[0],
    [desarrollos, desarrolloId]
  );

  const prototipo = useMemo(
    () => desarrollo?.prototipos.find((p) => p.id === prototipoId) ?? desarrollo?.prototipos[0],
    [desarrollo, prototipoId]
  );

  const armando = armable !== null && nivel === armable.nivel;
  const cerrado = prototipo?.paquetes.find((p) => p.nivel === nivel) ?? prototipo?.paquetes[0];

  // Se cotiza con la misma función que usa el motor al generar el plan: lo
  // que ve el comprador es exactamente lo que se le va a cargar (S1-04).
  const cotizacion = useMemo(() => {
    if (!prototipo || !desarrollo) return null;
    const eleccion = armando ? { paqueteId: null, canasta } : { paqueteId: cerrado?.id ?? "" };
    const nombre = armando ? armable!.nombre : (cerrado?.nombre ?? "");
    const nivelElegido = armando ? armable!.nivel : (cerrado?.nivel ?? nivel);
    try {
      const { cotizacion } = cotizarEnCatalogo(prototipo, eleccion);
      const { anticipo, mensualidad } = calcularExhibicionesEnteras(cotizacion.total, desarrollo.anticipoBP);
      const contado = Math.round(cotizacion.total * (1 - descuentoContado));
      return {
        nombre,
        nivel: nivelElegido,
        total: cotizacion.total,
        anticipo,
        mensualidad,
        contado,
        ahorro: cotizacion.total - contado,
        llevaLevantamiento: cotizacion.llevaLevantamiento,
        aviso: null as string | null,
      };
    } catch (err) {
      // Una canasta vacía no es un error del sitio: es que todavía no marcan nada.
      if (!(err instanceof ReglaError)) throw err;
      return {
        nombre,
        nivel: nivelElegido,
        total: 0,
        anticipo: 0,
        mensualidad: 0,
        contado: 0,
        ahorro: 0,
        llevaLevantamiento: false,
        aviso: err.message,
      };
    }
  }, [prototipo, desarrollo, armando, armable, cerrado, canasta, descuentoContado, nivel]);

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
    if (p) setCanasta(canastaInicialArmaElTuyo(p.partidas, p.climasDefault));
  }

  function cambiarDesarrollo(id: string) {
    setDesarrolloId(id);
    const siguiente = desarrollos.find((d) => d.id === id);
    if (siguiente?.prototipos[0]) cambiarPrototipo(siguiente.prototipos[0].id, siguiente.prototipos);
  }

  const opciones = [
    ...prototipo.paquetes.map((p) => ({ nivel: p.nivel, nombre: p.nombre })),
    ...(armable ? [{ nivel: armable.nivel, nombre: armable.nombre }] : []),
  ];
  const armables = prototipo.partidas.filter((p) => p.armable && p.precioLista !== null);
  const financiable = esFinanciable(cotizacion.total, desarrollo.minimoPlan);
  // El apartado recibe la misma elección: prototipo, paquete y, en «Arma el
  // tuyo», la canasta como `clave:cantidad` sin lo que va en cero.
  const ligaApartar =
    `/apartar?prototipo=${prototipo.id}&paquete=${armando ? armable!.id : (cerrado?.id ?? "")}` +
    (armando
      ? `&canasta=${Object.entries(canasta)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${k}:${n}`)
          .join(",")}`
      : "");

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
            <CanastaEditor
              partidas={armables}
              canasta={canasta}
              climasDefault={prototipo.climasDefault}
              onCambiar={(clave, cantidad) => setCanasta((c) => ({ ...c, [clave]: cantidad }))}
            />
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
            {cotizacion.total > 0 && (
              <p className="mt-1.5 text-[12.5px] text-ink-2">
                {cotizacion.llevaLevantamiento
                  ? "Incluye levantamiento en obra: medimos tu depa antes de fabricar."
                  : "Sin levantamiento: todo lo que marcaste es de catálogo."}
              </p>
            )}
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
        <p className="label">Paquete {cotizacion.nombre}</p>
        <p className="figure mt-2 text-[clamp(38px,5.5vw,54px)] leading-none">
          {mx(cotizacion.total)}
        </p>
        <p className="mt-2 text-[14.5px] text-muted">+ IVA · instalado</p>

        {cotizacion.aviso ? (
          <p className="mt-7 border-t border-line-2 pt-6 text-[15px] text-ink-2">{cotizacion.aviso}</p>
        ) : financiable ? (
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
              meses arranca desde {mx(desarrollo.minimoPlan)}.
            </p>
            <p className="mt-2 text-[14px] text-muted">
              Te faltan {mx(desarrollo.minimoPlan - cotizacion.total)} para poder pagarlo en
              mensualidades.
            </p>
          </div>
        )}

        <div className="mt-auto pt-7">
          {financiable && !cotizacion.aviso ? (
            <Link href={ligaApartar} className="btn w-full">
              <ContenidoBoton texto="Quiero apartarlo" flecha />
            </Link>
          ) : (
            <button type="button" className="btn w-full" disabled>
              <ContenidoBoton texto="Quiero apartarlo" flecha />
            </button>
          )}
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
