"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
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

/** Un desarrollo con sus prototipos, tal como lo arma lib/motor/catalogo.ts, más su foto. */
export type Desarrollo = ProyectoCotizable & { prototipos: PrototipoCotizable[]; imagen: string | null };

const mx = (n: number) => "$" + n.toLocaleString("es-MX");

/**
 * El cotizador en tres pasos: desarrollo, departamento y paquete. A la
 * derecha, el total y el plan de pagos siempre a la vista. Cotiza con la
 * misma función que el alta y el motor (S1-04).
 */
export default function Configurador({
  desarrollos,
  armable,
  descuentoContado,
  disponibles,
  imagenesPaquete,
}: {
  desarrollos: Desarrollo[];
  armable: PaqueteArmable | null;
  descuentoContado: number;
  /** Unidades libres por prototipo. */
  disponibles: Record<string, number>;
  /** Foto por nivel de paquete. */
  imagenesPaquete: Record<number, string | null>;
}) {
  const [desarrolloId, setDesarrolloId] = useState(desarrollos[0]?.id ?? "");
  const [prototipoId, setPrototipoId] = useState(desarrollos[0]?.prototipos[0]?.id ?? "");
  const [nivel, setNivel] = useState(1);
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

  const cotizacion = useMemo(() => {
    if (!prototipo || !desarrollo) return null;
    const eleccion = armando ? { paqueteId: null, canasta } : { paqueteId: cerrado?.id ?? "" };
    const nombre = armando ? armable!.nombre : (cerrado?.nombre ?? "");
    try {
      const { cotizacion } = cotizarEnCatalogo(prototipo, eleccion);
      const { anticipo, mensualidad } = calcularExhibicionesEnteras(cotizacion.total, desarrollo.anticipoBP);
      const contado = Math.round(cotizacion.total * (1 - descuentoContado));
      return {
        nombre,
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
      return { nombre, total: 0, anticipo: 0, mensualidad: 0, contado: 0, ahorro: 0, llevaLevantamiento: false, aviso: err.message };
    }
  }, [prototipo, desarrollo, armando, armable, cerrado, canasta, descuentoContado]);

  if (!desarrollo || !prototipo || !cotizacion) {
    return (
      <p className="note">Todavía no hay precios cargados para cotizar. Cárgalos desde el back office.</p>
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

  const armables = prototipo.partidas.filter((p) => p.armable && p.precioLista !== null);
  const financiable = esFinanciable(cotizacion.total, desarrollo.minimoPlan);
  const quedan = disponibles[prototipo.id] ?? 0;
  const puedeApartar = financiable && !cotizacion.aviso && quedan > 0;
  const ligaApartar =
    `/apartar?prototipo=${prototipo.id}&paquete=${armando ? armable!.id : (cerrado?.id ?? "")}` +
    (armando
      ? `&canasta=${Object.entries(canasta)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${k}:${n}`)
          .join(",")}`
      : "");

  return (
    <div className="cz">
      <div className="cz-pasos">
        {/* 1 · Desarrollo */}
        <section className="cz-paso" aria-labelledby="paso-desarrollo">
          <h2 id="paso-desarrollo" className="cz-paso-titulo">
            <span className="cz-n">1</span> ¿En qué desarrollo compraste?
          </h2>
          <div className="cz-desarrollos">
            {desarrollos.map((d) => (
              <button
                key={d.id}
                type="button"
                className="cz-desarrollo"
                aria-pressed={d.id === desarrollo.id}
                onClick={() => cambiarDesarrollo(d.id)}
              >
                <span className="cz-desarrollo-foto">
                  {d.imagen && <Image src={d.imagen} alt="" fill sizes="(max-width: 640px) 50vw, 240px" className="object-cover" />}
                </span>
                <span className="cz-desarrollo-nombre">{d.nombre}</span>
                <span className="cz-meta">{d.prototipos.length} prototipos</span>
              </button>
            ))}
          </div>
        </section>

        {/* 2 · Departamento */}
        <section className="cz-paso" aria-labelledby="paso-depa">
          <h2 id="paso-depa" className="cz-paso-titulo">
            <span className="cz-n">2</span> ¿Cuál es tu departamento?
          </h2>
          <div className="cz-chips">
            {desarrollo.prototipos.map((p) => {
              const libres = disponibles[p.id] ?? 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  className="cz-chip"
                  aria-pressed={p.id === prototipo.id}
                  onClick={() => cambiarPrototipo(p.id)}
                >
                  <span className="font-semibold">{p.clave}</span>
                  <span className="cz-meta">
                    {p.superficie} m² · {p.recamaras === 1 ? "1 rec." : `${p.recamaras} rec.`}
                    {libres === 0 ? " · agotado" : ""}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="cz-ayuda">Viene en tu contrato de compraventa con el desarrollador.</p>
        </section>

        {/* 3 · Paquete */}
        <section className="cz-paso" aria-labelledby="paso-paquete">
          <h2 id="paso-paquete" className="cz-paso-titulo">
            <span className="cz-n">3</span> Elige tu paquete
          </h2>
          <div className="cz-paquetes">
            {prototipo.paquetes.map((p) => (
              <button
                key={p.id}
                type="button"
                className="cz-paquete"
                aria-pressed={!armando && p.nivel === cerrado?.nivel}
                onClick={() => setNivel(p.nivel)}
              >
                <span className="cz-paquete-foto">
                  {imagenesPaquete[p.nivel] && (
                    <Image src={imagenesPaquete[p.nivel]!} alt="" fill sizes="(max-width: 640px) 50vw, 200px" className="object-cover" />
                  )}
                </span>
                <span className="cz-meta">Paquete 0{p.nivel}</span>
                <span className="cz-paquete-nombre">{p.nombre}</span>
                <span className="cz-paquete-precio">{mx(p.precio)}</span>
              </button>
            ))}
            {armable && (
              <button
                type="button"
                className="cz-paquete cz-paquete-armable"
                aria-pressed={armando}
                onClick={() => setNivel(armable.nivel)}
              >
                <span className="cz-meta">Paquete 0{armable.nivel} · a tu medida</span>
                <span className="cz-paquete-nombre">{armable.nombre}</span>
                <span className="cz-ayuda mt-1">Pieza por pieza, a precio de lista. Sin cocina.</span>
              </button>
            )}
          </div>
          <p className="cz-ayuda">
            Cada paquete incluye todo el anterior.{" "}
            {cerrado && !armando && (
              <Link href={`/paquetes/${cerrado.slug}`} className="text-accent underline-offset-4 hover:underline">
                Ver qué incluye {cerrado.nombre}
              </Link>
            )}
          </p>
        </section>

        {armando && (
          <section className="cz-paso" aria-labelledby="paso-armar">
            <h2 id="paso-armar" className="cz-paso-titulo">
              <span className="cz-n">4</span> Marca lo que quieras
            </h2>
            <CanastaEditor
              partidas={armables}
              canasta={canasta}
              climasDefault={prototipo.climasDefault}
              onCambiar={(clave, cantidad) => setCanasta((c) => ({ ...c, [clave]: cantidad }))}
            />
            <p className="cz-ayuda">
              Precios de lista por pieza para tu prototipo. ¿Quieres cocina? Elige un paquete cerrado.
              {cotizacion.total > 0 &&
                (cotizacion.llevaLevantamiento
                  ? " Incluye levantamiento en obra: medimos tu depa antes de fabricar."
                  : " Sin levantamiento: todo lo que marcaste es de catálogo.")}
            </p>
          </section>
        )}
      </div>

      {/* Resumen: pegajoso en escritorio, al final en teléfono. */}
      <aside className="cz-resumen" aria-live="polite">
        <p className="cz-resumen-etiqueta">
          {desarrollo.nombre} · {prototipo.clave}
        </p>
        <p className="cz-resumen-paquete">{cotizacion.nombre}</p>
        <p className="cz-total">{mx(cotizacion.total)}</p>
        <p className="cz-resumen-nota">Precio total instalado</p>

        {cotizacion.aviso ? (
          <p className="cz-resumen-bloque">{cotizacion.aviso}</p>
        ) : financiable ? (
          <>
            <dl className="cz-plan">
              <div>
                <dt>Apartas con</dt>
                <dd>{mx(cotizacion.anticipo)}</dd>
              </div>
              <div>
                <dt>12 mensualidades de</dt>
                <dd>{mx(cotizacion.mensualidad)}</dd>
              </div>
            </dl>
            <p className="cz-resumen-bloque">
              De contado: <b>{mx(cotizacion.contado)}</b> · ahorras {mx(cotizacion.ahorro)}
            </p>
          </>
        ) : (
          <p className="cz-resumen-bloque">
            <b>Se paga de contado.</b> El plan a 12 meses arranca desde {mx(desarrollo.minimoPlan)}; te faltan{" "}
            {mx(desarrollo.minimoPlan - cotizacion.total)}.
          </p>
        )}

        {puedeApartar ? (
          <Link href={ligaApartar} className="btn btn-claro-lleno mt-7 w-full">
            <ContenidoBoton texto="Quiero apartarlo" flecha />
          </Link>
        ) : (
          <button type="button" className="btn btn-claro-lleno mt-7 w-full" disabled>
            <ContenidoBoton texto="Quiero apartarlo" flecha />
          </button>
        )}
        <p className="cz-resumen-nota mt-3">
          {quedan === 0
            ? `Ya no quedan ${prototipo.clave} por apartar. Elige otro departamento.`
            : quedan <= 3
              ? `Quedan ${quedan} ${quedan === 1 ? "departamento" : "departamentos"} ${prototipo.clave}.`
              : `${quedan} departamentos ${prototipo.clave} disponibles.`}
        </p>
        <p className="cz-resumen-nota mt-4 border-t border-white/15 pt-4">
          Sin intereses ni trámite de crédito. El precio se congela al dar tu anticipo.
        </p>
      </aside>
    </div>
  );
}
