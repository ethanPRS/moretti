"use client";

import { useState } from "react";
import type { Cartera, DineroMoretti, Mes } from "@/lib/motor/graficas";

/**
 * Las gráficas del inicio del back office (retro del Sprint 2). SVG a mano,
 * sin librería: tres formas y ninguna dependencia nueva.
 * Colores: azul = cobrado / transferido, naranja = vencido, gris = lo que
 * falta (validados para daltonismo; ver docs/sprint-03). Cada gráfica trae su
 * tabla, y los segmentos llevan su nombre en la leyenda: el color nunca va solo.
 */

const mx = (v: number) =>
  v.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const corto = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)} M` : v >= 1000 ? `$${Math.round(v / 1000)} mil` : mx(v);

export default function Graficas({
  porMes,
  cartera,
  moretti,
}: {
  porMes: Mes[];
  cartera: Cartera;
  moretti: DineroMoretti[];
}) {
  return (
    <section className="grid gap-3 lg:grid-cols-2" aria-label="Gráficas de la cartera">
      <CobradoPorMes meses={porMes} />
      <EstadoCartera c={cartera} />
      {moretti.length > 0 && <DineroDeMoretti filas={moretti} />}
    </section>
  );
}

function Tarjeta({ titulo, sub, children, tabla, ancha }: { titulo: string; sub: string; children: React.ReactNode; tabla: React.ReactNode; ancha?: boolean }) {
  return (
    <figure className={`card graf p-5 sm:p-6${ancha ? " lg:col-span-2" : ""}`}>
      <figcaption>
        <p className="font-semibold">{titulo}</p>
        <p className="text-[13px] text-muted">{sub}</p>
      </figcaption>
      <div className="mt-4">{children}</div>
      <details className="mt-3 text-[13px]">
        <summary className="cursor-pointer text-muted">Ver como tabla</summary>
        <div className="mt-2 overflow-x-auto">{tabla}</div>
      </details>
    </figure>
  );
}

function CobradoPorMes({ meses }: { meses: Mes[] }) {
  const [activo, setActivo] = useState<number | null>(null);
  const W = 520, H = 200, IZQ = 8, ABAJO = 26, ARRIBA = 22;
  const max = Math.max(...meses.map((m) => m.cobrado), 1);
  const paso = (W - IZQ * 2) / meses.length;
  const ancho = Math.min(44, paso * 0.56);
  const alto = (v: number) => (v / max) * (H - ABAJO - ARRIBA);
  const iMax = meses.findIndex((m) => m.cobrado === max);
  const total = meses.reduce((a, m) => a + m.cobrado, 0);

  return (
    <Tarjeta
      titulo="Cobrado por mes"
      sub={`Últimos 6 meses · ${mx(total)} en total`}
      tabla={
        <table className="tbl">
          <thead><tr><th>Mes</th><th className="r">Pagos</th><th className="r">Cobrado</th></tr></thead>
          <tbody>{meses.map((m) => <tr key={m.clave}><td>{m.etiqueta} {m.clave.slice(0, 4)}</td><td className="r">{m.pagos}</td><td className="r">{mx(m.cobrado)}</td></tr>)}</tbody>
        </table>
      }
    >
      <div className="graf-lienzo">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Cobrado por mes: ${meses.map((m) => `${m.etiqueta} ${mx(m.cobrado)}`).join(", ")}`}>
          <line x1={0} x2={W} y1={H - ABAJO} y2={H - ABAJO} className="graf-base" />
          {meses.map((m, i) => {
            const cx = IZQ + paso * i + paso / 2;
            const h = alto(m.cobrado);
            const y = H - ABAJO - h;
            const etiqueta = m.cobrado > 0 && (i === iMax || i === meses.length - 1);
            return (
              <g key={m.clave} onMouseEnter={() => setActivo(i)} onMouseLeave={() => setActivo(null)}>
                {/* Zona de toque más grande que la barra. */}
                <rect x={cx - paso / 2} y={0} width={paso} height={H} fill="transparent" />
                {h > 0 && (
                  <path
                    d={barra(cx - ancho / 2, y, ancho, h)}
                    className="graf-serie"
                    data-tenue={activo !== null && activo !== i ? "" : undefined}
                  />
                )}
                {etiqueta && <text x={cx} y={y - 6} textAnchor="middle" className="graf-valor">{corto(m.cobrado)}</text>}
                <text x={cx} y={H - 8} textAnchor="middle" className="graf-eje">{m.etiqueta}</text>
              </g>
            );
          })}
        </svg>
        {activo !== null && (
          <div className="graf-tip" style={{ left: `${((IZQ + paso * activo + paso / 2) / W) * 100}%` }}>
            <b>{meses[activo].etiqueta} {meses[activo].clave.slice(0, 4)}</b>
            <span>{mx(meses[activo].cobrado)} · {meses[activo].pagos} {meses[activo].pagos === 1 ? "pago" : "pagos"}</span>
          </div>
        )}
      </div>
    </Tarjeta>
  );
}

/** Barra con las puntas de arriba redondeadas (4 px) y la base recta sobre el eje. */
function barra(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

type Segmento = { nombre: string; valor: number; clase: string };

function Apilada({ segmentos, etiqueta }: { segmentos: Segmento[]; etiqueta: string }) {
  const total = segmentos.reduce((a, s) => a + s.valor, 0);
  if (total <= 0) return <div className="graf-vacia">Sin datos todavía.</div>;
  return (
    <div className="graf-apilada" role="img" aria-label={`${etiqueta}: ${segmentos.map((s) => `${s.nombre} ${mx(s.valor)}`).join(", ")}`}>
      {segmentos.filter((s) => s.valor > 0).map((s) => (
        <span key={s.nombre} className={s.clase} style={{ flexGrow: s.valor }} title={`${s.nombre}: ${mx(s.valor)} (${Math.round((s.valor / total) * 100)} %)`} />
      ))}
    </div>
  );
}

function Leyenda({ segmentos }: { segmentos: Segmento[] }) {
  const total = segmentos.reduce((a, s) => a + s.valor, 0) || 1;
  return (
    <ul className="graf-leyenda">
      {segmentos.map((s) => (
        <li key={s.nombre}>
          <span className={`graf-muestra ${s.clase}`} />
          <span className="text-ink-2">{s.nombre}</span>
          <b>{mx(s.valor)}</b>
          <span className="text-muted">{Math.round((s.valor / total) * 100)} %</span>
        </li>
      ))}
    </ul>
  );
}

function EstadoCartera({ c }: { c: Cartera }) {
  const seg: Segmento[] = [
    { nombre: "Cobrado", valor: c.cobrado, clase: "graf-s-cobrado" },
    { nombre: "Por cobrar, al corriente", valor: c.alCorriente, clase: "graf-s-resto" },
    { nombre: "Vencido", valor: c.vencido, clase: "graf-s-vencido" },
  ];
  const total = c.cobrado + c.alCorriente + c.vencido;
  return (
    <Tarjeta
      titulo="Estado de la cartera"
      sub={total > 0 ? `De ${mx(total)} en planes vivos` : "Planes activos, suspendidos y liquidados"}
      tabla={
        <table className="tbl">
          <tbody>{seg.map((s) => <tr key={s.nombre}><td>{s.nombre}</td><td className="r">{mx(s.valor)}</td></tr>)}</tbody>
        </table>
      }
    >
      <Apilada segmentos={seg} etiqueta="Estado de la cartera" />
      <Leyenda segmentos={seg} />
      {c.vencido > 0 && (
        <p className="mt-3 text-[13px] text-ink-2">
          ⚠ Hay {mx(c.vencido)} vencidos: el detalle por comprador está en <a className="underline" href="/admin/cobranza">Cobranza</a>.
        </p>
      )}
    </Tarjeta>
  );
}

function DineroDeMoretti({ filas }: { filas: DineroMoretti[] }) {
  const max = Math.max(...filas.map((f) => f.transferido + f.retenido), 1);
  return (
    <Tarjeta
      ancha
      titulo="El dinero de Moretti"
      sub="Lo cobrado menos la comisión: cuánto ya se transfirió y cuánto retiene la plataforma (D-34)"
      tabla={
        <table className="tbl">
          <thead><tr><th>Proyecto</th><th className="r">Transferido</th><th className="r">Retenido</th></tr></thead>
          <tbody>{filas.map((f) => <tr key={f.proyecto}><td>{f.proyecto}</td><td className="r">{mx(f.transferido)}</td><td className="r">{mx(f.retenido)}</td></tr>)}</tbody>
        </table>
      }
    >
      <div className="flex flex-col gap-3">
        {filas.map((f) => (
          <div key={f.proyecto}>
            <div className="flex justify-between text-[13px]">
              <span className="font-medium">{f.proyecto}</span>
              <span className="text-muted">{mx(f.transferido + f.retenido)}</span>
            </div>
            <div style={{ width: `${((f.transferido + f.retenido) / max) * 100}%` }}>
              <Apilada
                etiqueta={f.proyecto}
                segmentos={[
                  { nombre: "Transferido", valor: f.transferido, clase: "graf-s-cobrado" },
                  { nombre: "Retenido", valor: f.retenido, clase: "graf-s-resto" },
                ]}
              />
            </div>
          </div>
        ))}
      </div>
      <ul className="graf-leyenda">
        <li><span className="graf-muestra graf-s-cobrado" /><span className="text-ink-2">Transferido a Moretti</span></li>
        <li><span className="graf-muestra graf-s-resto" /><span className="text-ink-2">Retenido en la plataforma</span></li>
      </ul>
      <p className="mt-2 text-[13px]"><a className="underline" href="/admin/transferencias">Autorizar transferencias →</a></p>
    </Tarjeta>
  );
}
