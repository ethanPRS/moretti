"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
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

/**
 * El cotizador de la portada, con la forma de la maqueta de Ana Cris (5b,
 * sección «Cotiza tu departamento»): desarrollo, prototipo y paquete a la
 * izquierda; precio, anticipo y mensualidades a la derecha. Cotiza con la
 * misma función que el alta y el motor (S1-04).
 *
 * Lo que eligen aquí lo lee también la sección «Antes de decir que sí»
 * (Condiciones): al aceptar las ocho, sigue con ese paquete a /apartar.
 */

export type Desarrollo = ProyectoCotizable & { prototipos: PrototipoCotizable[] };

const mx = (n: number) => "$" + n.toLocaleString("es-MX");

type Eleccion = { resumen: string; ligaApartar: string | null; motivo: string | null };
const ContextoEleccion = createContext<{ eleccion: Eleccion; setEleccion: (e: Eleccion) => void } | null>(null);

export function ProveedorCotizacion({ children }: { children: React.ReactNode }) {
  const [eleccion, setEleccion] = useState<Eleccion>({ resumen: "", ligaApartar: null, motivo: null });
  return <ContextoEleccion.Provider value={{ eleccion, setEleccion }}>{children}</ContextoEleccion.Provider>;
}

function useEleccion() {
  const c = useContext(ContextoEleccion);
  if (!c) throw new Error("Falta <ProveedorCotizacion>.");
  return c;
}

export function Calculadora({
  desarrollos,
  armable,
  descuentoContado,
  disponibles,
}: {
  desarrollos: Desarrollo[];
  armable: PaqueteArmable | null;
  descuentoContado: number;
  disponibles: Record<string, number>;
}) {
  const { setEleccion } = useEleccion();
  const [desarrolloId, setDesarrolloId] = useState(desarrollos[0]?.id ?? "");
  const [prototipoId, setPrototipoId] = useState(desarrollos[0]?.prototipos[0]?.id ?? "");
  const [nivel, setNivel] = useState(2);
  const [canasta, setCanasta] = useState<Canasta>(() => {
    const p = desarrollos[0]?.prototipos[0];
    return p ? canastaInicialArmaElTuyo(p.partidas, p.climasDefault) : {};
  });

  const desarrollo = desarrollos.find((d) => d.id === desarrolloId) ?? desarrollos[0];
  const prototipo = desarrollo?.prototipos.find((p) => p.id === prototipoId) ?? desarrollo?.prototipos[0];
  const armando = armable !== null && nivel === armable.nivel;
  const cerrados = prototipo?.paquetes ?? [];
  const cerrado = cerrados.find((p) => p.nivel === nivel) ?? cerrados[0];

  const c = useMemo(() => {
    if (!prototipo || !desarrollo) return null;
    const nombre = armando ? armable!.nombre : (cerrado?.nombre ?? "");
    try {
      const { cotizacion } = cotizarEnCatalogo(prototipo, armando ? { paqueteId: null, canasta } : { paqueteId: cerrado?.id ?? "" });
      const { anticipo, mensualidad } = calcularExhibicionesEnteras(cotizacion.total, desarrollo.anticipoBP);
      const contado = Math.round(cotizacion.total * (1 - descuentoContado));
      return { nombre, total: cotizacion.total, anticipo, mensualidad, contado, ahorro: cotizacion.total - contado, aviso: null as string | null };
    } catch (err) {
      if (!(err instanceof ReglaError)) throw err;
      return { nombre, total: 0, anticipo: 0, mensualidad: 0, contado: 0, ahorro: 0, aviso: err.message };
    }
  }, [prototipo, desarrollo, armando, armable, cerrado, canasta, descuentoContado]);

  // Lo que ve la sección de condiciones. Se calcula aquí y se publica al render.
  const financiable = c && desarrollo ? esFinanciable(c.total, desarrollo.minimoPlan) : false;
  const quedan = prototipo ? (disponibles[prototipo.id] ?? 0) : 0;
  const liga =
    prototipo && c && !c.aviso && financiable && quedan > 0
      ? `/apartar?prototipo=${prototipo.id}&paquete=${armando ? armable!.id : (cerrado?.id ?? "")}` +
        (armando
          ? `&canasta=${Object.entries(canasta).filter(([, n]) => n > 0).map(([k, n]) => `${k}:${n}`).join(",")}`
          : "")
      : null;
  const motivo = !c || c.aviso ? (c?.aviso ?? null) : !financiable ? "Este paquete se paga de contado." : quedan === 0 ? "Ya no quedan unidades libres de este prototipo." : null;
  const resumen = prototipo && c ? `${c.nombre} · ${prototipo.clave} · ${mx(c.total)} + IVA` : "";
  useEffect(() => {
    setEleccion({ resumen, ligaApartar: liga, motivo });
  }, [resumen, liga, motivo, setEleccion]);

  if (!desarrollo || !prototipo || !c) {
    return <p className="note">Todavía no hay precios cargados para cotizar.</p>;
  }

  function cambiarPrototipo(id: string, lista = desarrollo!.prototipos) {
    setPrototipoId(id);
    const p = lista.find((x) => x.id === id);
    if (p) setCanasta(canastaInicialArmaElTuyo(p.partidas, p.climasDefault));
  }

  const opciones = [...cerrados.map((p) => ({ nivel: p.nivel, nombre: p.nombre })), ...(armable ? [{ nivel: armable.nivel, nombre: armable.nombre }] : [])];
  const armables = prototipo.partidas.filter((p) => p.armable && p.precioLista !== null);

  return (
    <div className="calc">
      <div className="calc-in">
        <div className="field">
          <label htmlFor="des">Desarrollo</label>
          <select
            id="des"
            value={desarrollo.id}
            onChange={(e) => {
              setDesarrolloId(e.target.value);
              const d = desarrollos.find((x) => x.id === e.target.value);
              if (d?.prototipos[0]) cambiarPrototipo(d.prototipos[0].id, d.prototipos);
            }}
          >
            {desarrollos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pro">Tu prototipo</label>
          <select id="pro" value={prototipo.id} onChange={(e) => cambiarPrototipo(e.target.value)}>
            {desarrollo.prototipos.map((p) => <option key={p.id} value={p.id}>{p.clave}</option>)}
          </select>
          <p className="meta">{prototipo.superficie} m² · {prototipo.recamaras} recámaras</p>
        </div>
        <div className="field">
          <label>Paquete</label>
          <div className="seg" style={{ gridTemplateColumns: `repeat(${opciones.length}, 1fr)` }}>
            {opciones.map((o) => (
              <button key={o.nivel} type="button" aria-pressed={o.nivel === nivel} onClick={() => setNivel(o.nivel)}>
                {o.nombre}
              </button>
            ))}
          </div>
          {armando && (
            <div className="arma">
              <p className="arma-t">Sin cocina. Marca lo que sí quieres:</p>
              <CanastaEditor
                partidas={armables}
                canasta={canasta}
                climasDefault={prototipo.climasDefault}
                onCambiar={(clave, cantidad) => setCanasta((x) => ({ ...x, [clave]: cantidad }))}
              />
              <p className="arma-n">Los climas salen de tu prototipo: uno por espacio. Súbele o bájale. Todo a precio de lista.</p>
            </div>
          )}
        </div>
        <div className="helper">
          <p>
            <b>¿No sabes cuál es tu prototipo?</b> Viene en tu contrato de compraventa, o mándanos tu número de
            departamento y nosotros lo identificamos en el plano.
          </p>
        </div>
      </div>

      <div className="calc-out">
        <p className="price-lbl">Precio del paquete</p>
        <p className="price">
          {c.aviso ? "—" : mx(c.total)}
          <small> + IVA · instalado</small>
        </p>
        <p className="meta" style={{ marginTop: 0 }}>Paquete {c.nombre}</p>
        <div className="split">
          <div><p className="k">Apartas con</p><p className="v">{c.aviso ? "—" : mx(c.anticipo)}</p></div>
          <div><p className="k">12 mensualidades de</p><p className="v">{c.aviso ? "—" : mx(c.mensualidad)}</p></div>
        </div>
        {c.aviso && <div className="contado">{c.aviso}</div>}
        {!c.aviso && !financiable && (
          <div className="contado">
            Este paquete se paga <b>de contado, en un solo pago</b>: el plan a 12 meses aplica desde {mx(desarrollo.minimoPlan)}.
          </div>
        )}
        {!c.aviso && (
          <div className="contado">
            Si lo liquidas de contado: <b>{mx(c.contado)}</b> · ahorras <b>{mx(c.ahorro)}</b>
          </div>
        )}
        <div className="calc-cta">
          <a className="btn btn-warm" href="#registro">
            <ContenidoBoton texto="Apartar mi paquete" />
          </a>
          <p className="disclaimer">
            Precios preliminares al público, sin IVA, con instalación incluida. Sujetos a la lista final del
            fabricante. Pisos, baños y canceles los entrega el desarrollador.
          </p>
        </div>
      </div>
    </div>
  );
}

const CONDICIONES: { titulo: string; texto: React.ReactNode }[] = [
  { titulo: "1 · Con quién contratas", texto: <>Tu contrato es con <b>Moretti</b>: fabrica, instala, garantiza y factura. día uno organiza el programa, te acompaña y administra tu plan de pagos; no fabrica ni instala. El desarrollador entrega tu departamento en obra blanca y no interviene en el equipamiento. Siempre sabes a quién llamar.</> },
  { titulo: "2 · Cómo pagas", texto: <>Hoy das el <b>30% de anticipo</b>. El resto son <b>doce mensualidades fijas, sin intereses</b>, que se cargan solas a la tarjeta que registres — te avisamos antes de cada cargo, y con esta aceptación los autorizas expresamente. Puedes adelantar pagos, y si liquidas antes de la sexta mensualidad pagas el precio de contado (8% menos). El plan a doce meses aplica desde $50,000; abajo de eso, un solo pago.</> },
  { titulo: "3 · Tu precio no se mueve", texto: <>Queda <b>congelado desde que pagas el anticipo hasta la entrega</b>, aunque pasen dieciocho meses y cambien los materiales o el tipo de cambio. Es el precio que ves en el cotizador, con instalación incluida, más IVA.</> },
  { titulo: "4 · Puedes arrepentirte", texto: <>Tienes <b>cinco días hábiles desde la firma</b> para cancelar y se te devuelve todo, sin penalización. Después, aplica lo que dice tu contrato: antes del levantamiento en obra, cancelas con un cargo administrativo; con una partida ya en producción, esa partida no se devuelve porque el material ya se compró para ti.</> },
  { titulo: "5 · Si un pago no pasa", texto: <>Se reintenta solo y te avisamos. Con <b>dos mensualidades vencidas el plan se suspende y tu producción se detiene</b> hasta que se regularice; tienes derecho a una reprogramación. Moretti nunca fabrica lo que no está pagado, y por eso tampoco te cobra por producción detenida.</> },
  { titulo: "6 · Hasta cuándo puedes cambiar", texto: <>Paquete, partidas, acabados y fotos de referencia se pueden cambiar <b>hasta el levantamiento en obra</b>, que es cuando se toman tus medidas reales. Después de esa fecha ya no hay cambios: el material se compra con esas medidas y esos acabados.</> },
  { titulo: "7 · Cómo te entregan", texto: <>Cuando el desarrollador entrega tu unidad, <b>un verificador independiente</b> —ni el fabricante ni el desarrollador— mide tu cocina y tus clósets en sitio. Moretti fabrica sobre esa medida e instala en el plazo pactado en tu contrato, contado desde que recibes llaves. Recibes con lista de verificación punto por punto, fotos de cada área y <b>acta firmada por ti</b>. Sin acta no hay entrega, y la garantía de Moretti arranca ese día.</> },
  { titulo: "8 · Tus facturas y tus datos", texto: <>Al firmar recibes tu <b>factura por el total</b> (en parcialidades) y después un <b>complemento de pago por cada mensualidad</b>; todo se descarga de tu expediente sin pedirlo. Tus datos personales y de pago se usan sólo para tu pedido y se comparten con Moretti para fabricar, instalar y facturar, conforme al aviso de privacidad que firmas.</> },
];

/** «Antes de decir que sí, lee esto.» Las ocho condiciones de la maqueta; al marcarlas, sigue a /apartar. */
export function Condiciones() {
  const { eleccion } = useEleccion();
  const [marcadas, setMarcadas] = useState<boolean[]>(() => CONDICIONES.map(() => false));
  const n = marcadas.filter(Boolean).length;
  const listas = n === CONDICIONES.length;

  return (
    <>
      <ol className="pasos-ap">
        <li className="on"><i>1</i> Lo que aceptas</li>
        <li><i>2</i> Tus datos</li>
        <li><i>3</i> Firma y anticipo</li>
      </ol>
      {eleccion.resumen && (
        <div className="ap-res">
          <b>{eleccion.resumen}</b>
          <span>Lo que elegiste en el cotizador. <a href="#calc" className="underline">Cambiarlo</a></span>
        </div>
      )}
      <div className="conds">
        {CONDICIONES.map((cond, i) => (
          <label key={cond.titulo} className="cond">
            <input
              type="checkbox"
              checked={marcadas[i]}
              onChange={(e) => setMarcadas((m) => m.map((x, j) => (j === i ? e.target.checked : x)))}
            />
            <span>
              <b>{cond.titulo}</b>
              <p>{cond.texto}</p>
            </span>
          </label>
        ))}
      </div>
      <div className="ap-pie">
        <p>{n} de {CONDICIONES.length}{listas && eleccion.motivo ? ` · ${eleccion.motivo}` : ""}</p>
        {listas && eleccion.ligaApartar ? (
          <a className="btn btn-warm" href={`${eleccion.ligaApartar}&condiciones=8`}>
            <ContenidoBoton texto="Acepto y continúo" />
          </a>
        ) : (
          <button className="btn btn-warm" type="button" disabled>
            <ContenidoBoton texto="Acepto y continúo" />
          </button>
        )}
      </div>
    </>
  );
}
