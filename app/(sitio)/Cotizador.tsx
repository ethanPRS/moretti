"use client";

import { useMemo, useState } from "react";

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

export type Desarrollo = {
  id: string;
  nombre: string;
  prototipos: {
    id: string;
    clave: string;
    superficie: number;
    recamaras: number;
    cotizaciones: Cotizacion[];
  }[];
};

const mx = (n: number) => "$" + n.toLocaleString("es-MX");

export default function Cotizador({ desarrollos }: { desarrollos: Desarrollo[] }) {
  const [desarrolloId, setDesarrolloId] = useState(desarrollos[0]?.id ?? "");
  const [prototipoId, setPrototipoId] = useState(
    desarrollos[0]?.prototipos[0]?.id ?? ""
  );
  const [nivel, setNivel] = useState(1);

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

  const cotizacion = useMemo(
    () =>
      prototipo?.cotizaciones.find((c) => c.nivel === nivel) ??
      prototipo?.cotizaciones[0],
    [prototipo, nivel]
  );

  if (!desarrollo || !prototipo || !cotizacion) {
    return (
      <p className="note">
        Todavía no hay precios cargados para cotizar. Cárgalos desde el back office.
      </p>
    );
  }

  function cambiarDesarrollo(id: string) {
    setDesarrolloId(id);
    const siguiente = desarrollos.find((d) => d.id === id);
    if (siguiente?.prototipos[0]) setPrototipoId(siguiente.prototipos[0].id);
  }

  return (
    <div className="card grid overflow-hidden md:grid-cols-2">
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
            onChange={(e) => setPrototipoId(e.target.value)}
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
            {prototipo.cotizaciones.map((c) => (
              <button
                key={c.paqueteId}
                type="button"
                aria-pressed={c.nivel === cotizacion.nivel}
                onClick={() => setNivel(c.nivel)}
                className={`rounded-full border px-2 py-2.5 text-[13.5px] font-semibold transition-colors ${
                  c.nivel === cotizacion.nivel
                    ? "border-accent bg-accent text-ground"
                    : "border-line-2 bg-surface text-ink-2 hover:bg-surface-2"
                }`}
              >
                {c.paqueteNombre}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-auto border-t border-line pt-5 text-[14.5px] text-ink-2">
          Sin intereses y sin trámite de crédito. El precio queda congelado cuando das
          tu anticipo, aunque la entrega sea hasta 2028.
        </p>
      </div>

      <div className="flex flex-col border-t border-line bg-surface-2 p-7 sm:p-9 md:border-l md:border-t-0">
        <p className="label">Paquete {cotizacion.paqueteNombre}</p>
        <p className="figure mt-2 text-[clamp(38px,5.5vw,54px)] leading-none">
          {mx(cotizacion.total)}
        </p>
        <p className="mt-2 text-[14.5px] text-muted">+ IVA · instalado</p>

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
  );
}
