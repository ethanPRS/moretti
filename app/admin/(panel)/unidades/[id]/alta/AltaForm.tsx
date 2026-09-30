"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { calcularExhibicionesEnteras } from "@/lib/motor/enteros";
import {
  avisoPerdidaPaquete,
  canastaInicialArmaElTuyo,
  contenidoComoCanasta,
  cotizarEnCatalogo,
  esFinanciable,
  mensajeDebajoDelMinimo,
  type Canasta,
  type PaqueteArmable,
  type ProyectoCotizable,
  type PrototipoCotizable,
} from "@/lib/motor/canasta";
import { ReglaError } from "@/lib/motor/errores";
import CanastaEditor from "@/components/CanastaEditor";
import { avisar } from "@/components/admin/avisar";

export type VistaPaquete = { imagen: string | null; descripcion: string | null };

const mx = (n: number) => "$" + Math.round(n).toLocaleString("es-MX");

const MODALIDAD = {
  PAQUETE: { texto: "Precio de paquete", clase: "ok" },
  A_LISTA: { texto: "Sin precio de paquete · todo a lista", clase: "late" },
  ARMA_EL_TUYO: { texto: "Arma el tuyo · a lista", clase: "info" },
} as const;

/**
 * El alta: se elige un paquete cerrado —y se le puede agregar o quitar— o se
 * arma la canasta desde cero, con la misma lista y la misma cotización que el
 * sitio (S1-04). El motor vuelve a cotizar al guardar; si algo no cuadra,
 * gana el motor.
 */
export default function AltaForm({
  unidadId,
  proyecto,
  prototipo,
  armable,
  vistas,
}: {
  unidadId: string;
  proyecto: ProyectoCotizable;
  prototipo: PrototipoCotizable;
  armable: PaqueteArmable | null;
  vistas: Record<string, VistaPaquete>;
}) {
  const router = useRouter();
  const inicial = prototipo.paquetes[0];
  const [paqueteId, setPaqueteId] = useState(inicial?.id ?? armable?.id ?? "");
  const [canasta, setCanasta] = useState<Canasta>(() =>
    inicial ? contenidoComoCanasta(inicial) : canastaInicialArmaElTuyo(prototipo.partidas, prototipo.climasDefault)
  );
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const esArmable = armable !== null && paqueteId === armable.id;
  const cerrado = prototipo.paquetes.find((p) => p.id === paqueteId) ?? null;
  const nombre = esArmable ? armable!.nombre : (cerrado?.nombre ?? "");
  const vista = vistas[paqueteId];

  const resultado = useMemo(() => {
    try {
      const { cotizacion } = cotizarEnCatalogo(prototipo, {
        paqueteId: esArmable ? null : paqueteId,
        canasta,
      });
      return { cotizacion, problema: null };
    } catch (err) {
      if (err instanceof ReglaError) return { cotizacion: null, problema: err.message };
      throw err;
    }
  }, [prototipo, paqueteId, esArmable, canasta]);

  const { cotizacion, problema } = resultado;
  const financiable = cotizacion !== null && esFinanciable(cotizacion.total, proyecto.minimoPlan);
  const plan = cotizacion ? calcularExhibicionesEnteras(cotizacion.total, proyecto.anticipoBP) : null;
  const modificado =
    cerrado !== null &&
    JSON.stringify(limpiar(canasta)) !== JSON.stringify(limpiar(contenidoComoCanasta(cerrado)));

  // En un cerrado se ven todas las partidas con precio (para agregar); en
  // «Arma el tuyo», sólo las que se pueden escoger: sin cocina.
  const lista = prototipo.partidas.filter(
    (p) => p.precioLista !== null && (esArmable ? p.armable : true)
  );

  function elegir(id: string) {
    setPaqueteId(id);
    setError(null);
    const paquete = prototipo.paquetes.find((p) => p.id === id);
    setCanasta(
      paquete
        ? contenidoComoCanasta(paquete)
        : canastaInicialArmaElTuyo(prototipo.partidas, prototipo.climasDefault)
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/compradores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: f.get("nombre"),
        contacto: f.get("contacto"),
        unidadId,
        paqueteId,
        canasta: limpiar(canasta),
      }),
    });
    setCargando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data.error ?? "No se pudo dar de alta.";
      avisar.error(msg);
      setError(msg);
      return;
    }
    const { plan, comprador } = await res.json();
    avisar.exito(`Comprador dado de alta con folio ${comprador.folio}.`);
    router.push(`/admin/planes/${plan.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="card grid overflow-clip md:grid-cols-2">
      <div className="flex flex-col gap-6 p-7">
        <div className="field">
          <span>Paquete</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {prototipo.paquetes.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={o.id === paqueteId}
                onClick={() => elegir(o.id)}
                className={`rounded-full border px-2 py-2.5 text-[13.5px] font-semibold transition-colors ${
                  o.id === paqueteId
                    ? "border-accent bg-accent text-ground"
                    : "border-line-2 bg-surface text-ink-2 hover:bg-surface-2"
                }`}
              >
                {o.nombre}
              </button>
            ))}
            {armable && (
              <button
                type="button"
                aria-pressed={esArmable}
                onClick={() => elegir(armable.id)}
                className={`col-span-2 rounded-full border px-2 py-2.5 text-[13.5px] font-semibold transition-colors sm:col-span-4 ${
                  esArmable
                    ? "border-warm bg-warm text-ground"
                    : "border-dashed border-warm/60 bg-warm-soft text-warm hover:border-warm"
                }`}
              >
                ✳ {armable.nombre}
              </button>
            )}
          </div>
        </div>

        <fieldset>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <legend className="label">
              {esArmable ? "Marca lo que lleva · sin cocina" : "Lo que lleva · agrega o quita"}
            </legend>
            {cotizacion && (
              <span className={`chip ${MODALIDAD[cotizacion.modalidad].clase}`}>
                {MODALIDAD[cotizacion.modalidad].texto}
              </span>
            )}
          </div>
          <CanastaEditor
            partidas={lista}
            canasta={canasta}
            climasDefault={prototipo.climasDefault}
            incluidas={cerrado?.contenido}
            acento={esArmable ? "warm" : "accent"}
            onCambiar={(clave, cantidad) => setCanasta((c) => ({ ...c, [clave]: cantidad }))}
          />
          {modificado && (
            <button
              type="button"
              onClick={() => elegir(paqueteId)}
              className="mt-2 text-[12.5px] text-accent hover:underline"
            >
              Regresar al paquete {nombre} tal cual
            </button>
          )}
          {cotizacion?.perdidaPaquete && (
            <p className="note blocked mt-3">{avisoPerdidaPaquete(cotizacion.perdidaPaquete)}</p>
          )}
          {cotizacion && (
            <p className="mt-2 text-[12.5px] text-ink-2">
              {cotizacion.llevaLevantamiento
                ? "Lleva levantamiento en obra: hay partidas a la medida."
                : "Sin levantamiento: todo es de catálogo y entra directo a pedido."}
            </p>
          )}
        </fieldset>

        <div className="field">
          <label htmlFor="nombre">Nombre del comprador</label>
          <input id="nombre" name="nombre" required placeholder="Nombre completo" />
        </div>

        <div className="field">
          <label htmlFor="contacto">Contacto</label>
          <input id="contacto" name="contacto" required placeholder="Teléfono o correo" />
        </div>

        {error && <p className="text-[13.5px] text-warm">{error}</p>}
      </div>

      <div className="flex flex-col gap-5 border-t border-line bg-surface-2 p-7 md:border-l md:border-t-0">
        <div className="flex h-full flex-col gap-5 md:sticky md:top-24 md:h-auto">
          {vista?.imagen && (
            <div className="media relative aspect-[16/10]">
              <Image
                src={vista.imagen}
                alt={`Interior con el paquete ${nombre}`}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                priority
              />
            </div>
          )}

          <div>
            <p className="label">
              {esArmable
                ? nombre
                : cotizacion?.modalidad === "A_LISTA"
                  ? `${nombre}, sin precio de paquete`
                  : `Paquete ${nombre}`}
            </p>
            <p className="figure mt-1.5 text-[clamp(34px,5vw,46px)] leading-none">
              {mx(cotizacion?.total ?? 0)}
              <span className="ml-2 font-sans text-[14px] font-medium tracking-normal text-muted">
                + IVA · instalado
              </span>
            </p>
            {vista?.descripcion && cotizacion?.modalidad !== "A_LISTA" && (
              <p className="mt-1.5 text-[13.5px] text-muted">{vista.descripcion}</p>
            )}
          </div>

          {problema ? (
            <p className="note blocked">{problema}</p>
          ) : financiable && plan ? (
            <div className="grid grid-cols-2 gap-5 border-t border-line-2 pt-5">
              <div>
                <p className="label">Aparta con</p>
                <p className="figure mt-1 text-[24px]">{mx(plan.anticipo)}</p>
              </div>
              <div>
                <p className="label">12 mensualidades de</p>
                <p className="figure mt-1 text-[24px]">{mx(plan.mensualidad)}</p>
              </div>
            </div>
          ) : (
            cotizacion && (
              <p className="note blocked">{mensajeDebajoDelMinimo(cotizacion.total, proyecto.minimoPlan)}</p>
            )
          )}

          <p className="note mt-auto">
            Al dar de alta se genera la <b>cotización</b>, partida por partida. El precio no se
            congela hasta que se cobre el anticipo, y el anticipo necesita el contrato firmado.
          </p>

          <button type="submit" disabled={cargando || !financiable} className="btn">
            {cargando ? "Generando…" : "Dar de alta y cotizar"}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Sin las partidas en cero, para comparar y para mandar al servidor. */
function limpiar(canasta: Canasta): Canasta {
  return Object.fromEntries(
    Object.entries(canasta)
      .filter(([, cantidad]) => cantidad > 0)
      .sort(([a], [b]) => a.localeCompare(b))
  );
}
