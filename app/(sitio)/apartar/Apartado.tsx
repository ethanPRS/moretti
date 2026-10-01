"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { calcularExhibicionesEnteras } from "@/lib/motor/enteros";
import { cotizarEnCatalogo, esFinanciable, type Canasta, type PrototipoCotizable } from "@/lib/motor/canasta";
import { ReglaError } from "@/lib/motor/errores";
import { ContenidoBoton } from "@/components/Boton";

const mx = (n: number) => "$" + n.toLocaleString("es-MX");

type Paso = "datos" | "contrato" | "pago" | "listo";
const PASOS: { id: Paso; texto: string }[] = [
  { id: "datos", texto: "Tus datos" },
  { id: "contrato", texto: "Contrato" },
  { id: "pago", texto: "Anticipo" },
  { id: "listo", texto: "Apartado" },
];

export default function Apartado({
  desarrollo,
  prototipo,
  paquete,
  canasta,
  unidades,
}: {
  desarrollo: { id: string; nombre: string; anticipoBP: number; minimoPlan: number };
  prototipo: PrototipoCotizable;
  paquete: { id: string; nombre: string; armable: boolean };
  canasta?: Canasta;
  unidades: { id: string; torre: string; numero: string }[];
}) {
  const [paso, setPaso] = useState<Paso>("datos");
  const [nombre, setNombre] = useState("");
  const [contacto, setContacto] = useState("");
  const [unidadId, setUnidadId] = useState(unidades[0]?.id ?? "");
  const [acepta, setAcepta] = useState(false);
  const [firma, setFirma] = useState("");
  const [planId, setPlanId] = useState<string | null>(null);
  const [folio, setFolio] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // Cada paso arranca arriba, no donde quedó el botón del anterior.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [paso]);

  // La misma cotización que el sitio y el motor (S1-04).
  const resultado = useMemo(() => {
    try {
      const { cotizacion } = cotizarEnCatalogo(prototipo, {
        paqueteId: paquete.armable ? null : paquete.id,
        canasta,
      });
      return { cotizacion, ...calcularExhibicionesEnteras(cotizacion.total, desarrollo.anticipoBP), problema: null };
    } catch (err) {
      if (!(err instanceof ReglaError)) throw err;
      return { cotizacion: null, problema: err.message };
    }
  }, [prototipo, paquete, canasta, desarrollo.anticipoBP]);

  const unidad = unidades.find((u) => u.id === unidadId);
  const porcentaje = desarrollo.anticipoBP / 100;

  if (!resultado.cotizacion) {
    return <Aviso titulo="Esta canasta no se puede apartar." texto={resultado.problema ?? ""} />;
  }
  const { cotizacion, anticipo, mensualidad, ultima } = resultado;
  if (!esFinanciable(cotizacion.total, desarrollo.minimoPlan)) {
    return (
      <Aviso
        titulo="Este paquete se paga de contado."
        texto={`El plan a 12 meses arranca desde ${mx(desarrollo.minimoPlan)}. Agrega partidas en el cotizador o escríbenos para apartarlo de contado.`}
      />
    );
  }
  if (unidades.length === 0) {
    return (
      <Aviso
        titulo={`Ya no quedan departamentos ${prototipo.clave} disponibles.`}
        texto="Todas las unidades de este prototipo ya están apartadas. Elige otro prototipo en el cotizador."
      />
    );
  }

  async function firmar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const res = await fetch("/api/apartar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, contacto, unidadId, paqueteId: paquete.id, canasta, firma, acepta }),
    });
    const data = await res.json().catch(() => ({}));
    setCargando(false);
    if (!res.ok) return setError(data.error ?? "No se pudo firmar el contrato. Intenta de nuevo.");
    setPlanId(data.planId);
    setFolio(data.folio);
    setPaso("pago");
  }

  async function pagar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const res = await fetch("/api/apartar/anticipo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    const data = await res.json().catch(() => ({}));
    setCargando(false);
    if (res.status === 202) return setError(data.mensaje ?? "Tu banco pidió confirmar el pago. Revisa tu app del banco.");
    if (!res.ok) return setError(data.error ?? "No se pudo cobrar el anticipo. Intenta con otra tarjeta.");
    setPaso("listo");
  }

  const indice = PASOS.findIndex((p) => p.id === paso);

  return (
    <section className="mx-auto max-w-[1080px] px-5 py-12 sm:px-7 sm:py-16">
      <ol className="flex flex-wrap gap-x-6 gap-y-2 text-[13.5px]" aria-label="Pasos para apartar">
        {PASOS.map((p, i) => (
          <li
            key={p.id}
            aria-current={i === indice ? "step" : undefined}
            className={i === indice ? "font-semibold text-ink" : i < indice ? "text-accent" : "text-muted"}
          >
            <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full border border-current text-[12px]">
              {i < indice ? "✓" : i + 1}
            </span>
            {p.texto}
          </li>
        ))}
      </ol>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="card p-6 sm:p-9">
          {paso === "datos" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPaso("contrato");
              }}
              className="flex flex-col gap-5"
            >
              <div>
                <h1 className="text-[28px]">¿A nombre de quién apartamos?</h1>
                <p className="mt-1.5 text-ink-2">
                  Con estos datos se hace tu contrato con Moretti. Van tal como aparecen en tu
                  identificación.
                </p>
              </div>
              <div className="field">
                <label htmlFor="unidad">Tu departamento</label>
                <select id="unidad" value={unidadId} onChange={(e) => setUnidadId(e.target.value)} required>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      Torre {u.torre} · Depa {u.numero}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[13px] text-muted">
                  El número viene en tu contrato de compraventa con el desarrollador.
                </p>
              </div>
              <div className="field">
                <label htmlFor="nombre">Nombre completo</label>
                <input
                  id="nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Mariana López Garza"
                  autoComplete="name"
                  minLength={3}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="contacto">Correo o celular</label>
                <input
                  id="contacto"
                  value={contacto}
                  onChange={(e) => setContacto(e.target.value)}
                  placeholder="Ej. mariana@correo.com o 81 1234 5678"
                  autoComplete="email"
                  minLength={5}
                  required
                />
                <p className="mt-1.5 text-[13px] text-muted">Ahí te mandamos tu contrato y tus recibos.</p>
              </div>
              <button type="submit" className="btn mt-2 self-start">
                <ContenidoBoton texto="Revisar mi contrato" flecha />
              </button>
            </form>
          )}

          {paso === "contrato" && (
            <form onSubmit={firmar} className="flex flex-col gap-5">
              <div>
                <p className="eyebrow">Simulación del contrato</p>
                <h1 className="mt-2 text-[28px]">Revisa y firma tu contrato con Moretti.</h1>
              </div>

              <div className="max-h-[420px] overflow-y-auto rounded-[var(--r-input)] border border-line-2 bg-ground p-5 text-[14px] leading-relaxed text-ink-2">
                <p className="font-semibold text-ink">
                  Contrato de suministro e instalación · {desarrollo.nombre}
                </p>
                <p className="mt-3">
                  <b className="text-ink">{nombre}</b> («el comprador»), propietario de la unidad
                  Torre {unidad?.torre}, Depa {unidad?.numero} (prototipo {prototipo.clave}), contrata
                  con <b className="text-ink">Moretti</b> el suministro e instalación de lo siguiente:
                </p>
                <ul className="mt-3 flex flex-col gap-1">
                  {cotizacion.renglones.map((r) => (
                    <li key={r.clave} className="flex justify-between gap-4">
                      <span>
                        {r.nombre}
                        {r.cantidad > 1 ? ` × ${r.cantidad}` : ""}
                      </span>
                      <span className="tabular-nums">{mx(r.importe)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 flex justify-between border-t border-line-2 pt-2 font-semibold text-ink">
                  <span>Total ({paquete.nombre})</span>
                  <span className="tabular-nums">{mx(cotizacion.total)}</span>
                </p>
                <ol className="mt-4 flex list-decimal flex-col gap-2 pl-5">
                  <li>
                    El comprador paga un anticipo de {mx(anticipo)} ({porcentaje}%) al firmar, y el
                    resto en 12 mensualidades de {mx(mensualidad)}
                    {ultima !== mensualidad ? ` (la última de ${mx(ultima)})` : ""}, sin intereses.
                  </li>
                  <li>El precio queda congelado al cobrarse el anticipo, partida por partida, hasta la entrega.</li>
                  <li>Las mensualidades se cargan a la tarjeta registrada. Se pueden adelantar o liquidar sin penalización.</li>
                  <li>
                    {cotizacion.llevaLevantamiento
                      ? "Moretti mide en obra antes de fabricar. Hasta ese levantamiento se pueden cambiar acabados y fotos de referencia."
                      : "Todo es de catálogo: no requiere levantamiento en obra."}
                  </li>
                  <li>Moretti instala al recibir el comprador su unidad y la garantía arranca con el acta de recepción.</li>
                </ol>
                <p className="mt-4 text-[12.5px] text-muted">
                  Documento de simulación para el prototipo. El contrato definitivo lo emite Moretti.
                </p>
              </div>

              <label className="flex items-start gap-3 text-[14.5px]">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[var(--accent)]"
                  checked={acepta}
                  onChange={(e) => setAcepta(e.target.checked)}
                  required
                />
                Leí el contrato y estoy de acuerdo con el plan de pagos.
              </label>
              <div className="field">
                <label htmlFor="firma">Firma: escribe tu nombre completo</label>
                <input
                  id="firma"
                  value={firma}
                  onChange={(e) => setFirma(e.target.value)}
                  placeholder={nombre}
                  className="font-display text-[18px] italic"
                  required
                />
              </div>

              {error && <p className="note blocked" role="alert">{error}</p>}
              <div className="flex flex-wrap gap-3">
                <button type="submit" className="btn" disabled={cargando || !acepta}>
                  <ContenidoBoton texto={cargando ? "Firmando…" : "Firmar y continuar al pago"} flecha />
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setPaso("datos")} disabled={cargando}>
                  <ContenidoBoton texto="Corregir mis datos" />
                </button>
              </div>
            </form>
          )}

          {paso === "pago" && (
            <form onSubmit={pagar} className="flex flex-col gap-5">
              <div>
                <p className="eyebrow">Contrato firmado · folio {folio}</p>
                <h1 className="mt-2 text-[28px]">Paga tu anticipo de {mx(anticipo)}.</h1>
                <p className="mt-1.5 text-ink-2">
                  Con este pago tu precio queda congelado. Guardamos la tarjeta para cargar tus
                  mensualidades de {mx(mensualidad)}.
                </p>
              </div>
              {/* Simulación: estos datos no salen del navegador. Con Stripe, aquí va su Payment Element. */}
              <div className="rounded-[var(--r-input)] border border-dashed border-line-2 p-5">
                <p className="text-[12.5px] text-muted">
                  Pago simulado: usa cualquier número, no se hace ningún cargo real.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_120px_100px]">
                  <div className="field">
                    <label htmlFor="tarjeta">Número de tarjeta</label>
                    <input id="tarjeta" inputMode="numeric" placeholder="4242 4242 4242 4242" autoComplete="off" required />
                  </div>
                  <div className="field">
                    <label htmlFor="vence">Vence</label>
                    <input id="vence" placeholder="MM/AA" autoComplete="off" required />
                  </div>
                  <div className="field">
                    <label htmlFor="cvc">CVC</label>
                    <input id="cvc" inputMode="numeric" placeholder="123" autoComplete="off" required />
                  </div>
                </div>
              </div>
              {error && <p className="note blocked" role="alert">{error}</p>}
              <button type="submit" className="btn self-start" disabled={cargando}>
                <ContenidoBoton texto={cargando ? "Cobrando…" : `Pagar ${mx(anticipo)}`} flecha />
              </button>
            </form>
          )}

          {paso === "listo" && (
            <div className="flex flex-col items-start gap-4">
              <p className="eyebrow">Folio {folio}</p>
              <h1 className="text-[32px]">Listo, tu paquete está apartado.</h1>
              <p className="max-w-[52ch] text-ink-2">
                Cobramos tu anticipo de {mx(anticipo)} y tu precio quedó congelado. Te mandamos el
                contrato a {contacto}. Tu primera mensualidad de {mx(mensualidad)} se carga el
                próximo mes.
              </p>
              <p className="max-w-[52ch] text-ink-2">
                Te contactamos para agendar la visita al depa muestra y elegir tus acabados.
              </p>
              <Link href="/" className="btn btn-ghost mt-2">
                <ContenidoBoton texto="Volver al inicio" />
              </Link>
            </div>
          )}
        </div>

        <aside className="card h-fit bg-surface-2 p-6">
          <p className="eyebrow">Tu apartado</p>
          <p className="mt-2 text-[20px] font-semibold">{paquete.nombre}</p>
          <p className="text-[14px] text-muted">
            {desarrollo.nombre} · {prototipo.clave}
            {unidad ? ` · Torre ${unidad.torre}, Depa ${unidad.numero}` : ""}
          </p>
          <dl className="mt-5 flex flex-col gap-2 border-t border-line-2 pt-4 text-[14.5px]">
            <div className="flex justify-between"><dt className="text-ink-2">Total</dt><dd className="font-semibold tabular-nums">{mx(cotizacion.total)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Anticipo hoy</dt><dd className="tabular-nums">{mx(anticipo)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">12 mensualidades</dt><dd className="tabular-nums">{mx(mensualidad)}</dd></div>
          </dl>
          {paso === "datos" && (
            <Link href="/cotizar" className="mt-5 inline-block text-[13.5px] text-accent hover:underline">
              Cambiar paquete
            </Link>
          )}
        </aside>
      </div>
    </section>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <section className="mx-auto max-w-[680px] px-7 py-24">
      <p className="eyebrow">Aparta tu paquete</p>
      <h1 className="mt-3 text-[30px]">{titulo}</h1>
      <p className="mt-3 text-ink-2">{texto}</p>
      <Link href="/cotizar" className="btn mt-7">
        <ContenidoBoton texto="Volver al cotizador" flecha />
      </Link>
    </section>
  );
}
