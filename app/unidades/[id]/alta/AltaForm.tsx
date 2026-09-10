"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Opcion = { paqueteId: string; nombre: string; nivel: number; monto: number };

const mx = (n: number) => "$" + Math.round(n).toLocaleString("es-MX");

export default function AltaForm({
  unidadId,
  opciones,
  porcentajeAnticipo,
}: {
  unidadId: string;
  opciones: Opcion[];
  porcentajeAnticipo: number;
}) {
  const router = useRouter();
  const [paqueteId, setPaqueteId] = useState(opciones[0].paqueteId);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const elegido = opciones.find((o) => o.paqueteId === paqueteId)!;
  const anticipo = Math.round(elegido.monto * porcentajeAnticipo);
  const mensualidad = Math.round((elegido.monto - anticipo) / 12);

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
      }),
    });
    setCargando(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "No se pudo dar de alta.");
      return;
    }
    const { plan } = await res.json();
    router.push(`/planes/${plan.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="card grid overflow-hidden md:grid-cols-2">
      <div className="flex flex-col gap-6 p-7">
        <div className="field">
          <span>Paquete</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {opciones.map((o) => (
              <button
                key={o.paqueteId}
                type="button"
                aria-pressed={o.paqueteId === paqueteId}
                onClick={() => setPaqueteId(o.paqueteId)}
                className={`rounded-brand border px-2 py-2.5 text-[13.5px] font-semibold transition-colors ${
                  o.paqueteId === paqueteId
                    ? "border-accent bg-accent text-ground"
                    : "border-line-2 bg-surface text-ink-2 hover:border-line-2 hover:bg-surface-2"
                }`}
              >
                {o.nombre}
              </button>
            ))}
          </div>
        </div>

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
        <div>
          <p className="label">Precio del paquete {elegido.nombre}</p>
          <p className="figure mt-1.5 text-[clamp(34px,5vw,46px)] leading-none">
            {mx(elegido.monto)}
            <span className="ml-2 font-sans text-[14px] font-medium tracking-normal text-muted">
              + IVA · instalado
            </span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-5 border-t border-line-2 pt-5">
          <div>
            <p className="label">Aparta con</p>
            <p className="figure mt-1 text-[24px]">{mx(anticipo)}</p>
          </div>
          <div>
            <p className="label">12 mensualidades de</p>
            <p className="figure mt-1 text-[24px]">{mx(mensualidad)}</p>
          </div>
        </div>

        <p className="note mt-auto">
          Al dar de alta se genera la <b>cotización</b>. El precio no se congela hasta que se cobre
          el anticipo, y el anticipo necesita el contrato firmado.
        </p>

        <button type="submit" disabled={cargando} className="btn">
          {cargando ? "Generando…" : "Dar de alta y cotizar"}
        </button>
      </div>
    </form>
  );
}
