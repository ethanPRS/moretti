"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Opcion = { id: string; nombre?: string; clave?: string };

export default function FormulariosProyecto({
  proyectoId,
  prototipos,
  paquetes,
}: {
  proyectoId: string;
  prototipos: Opcion[];
  paquetes: Opcion[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function enviar(url: string, cuerpo: unknown, form: HTMLFormElement) {
    setError(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "No se pudo guardar.");
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <details className="card group p-0">
      <summary className="cursor-pointer list-none px-6 py-4 text-[15px] font-semibold marker:content-none">
        <span className="text-accent group-open:hidden">+ </span>
        <span className="hidden text-accent group-open:inline">− </span>
        Agregar prototipos, precios o unidades
      </summary>

      <div className="grid gap-6 border-t border-line p-6 md:grid-cols-3">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            enviar(
              "/api/prototipos",
              {
                proyectoId,
                clave: f.get("clave"),
                superficie: f.get("superficie"),
                recamaras: f.get("recamaras"),
              },
              e.currentTarget
            );
          }}
        >
          <p className="label">Nuevo prototipo</p>
          <input name="clave" placeholder="Clave" required />
          <div className="flex gap-2">
            <input name="superficie" type="number" step="0.01" placeholder="m²" required />
            <input name="recamaras" type="number" placeholder="Rec." required />
          </div>
          <button className="btn btn-sm self-start">Agregar</button>
        </form>

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            enviar(
              "/api/precios",
              {
                prototipoId: f.get("prototipoId"),
                paqueteId: f.get("paqueteId"),
                monto: f.get("monto"),
              },
              e.currentTarget
            );
          }}
        >
          <p className="label">Nuevo precio</p>
          <select name="prototipoId" required defaultValue="">
            <option value="" disabled>
              Prototipo…
            </option>
            {prototipos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.clave}
              </option>
            ))}
          </select>
          <select name="paqueteId" required defaultValue="">
            <option value="" disabled>
              Paquete…
            </option>
            {paquetes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <input name="monto" type="number" step="0.01" placeholder="Monto" required />
          <button className="btn btn-sm self-start">Guardar</button>
        </form>

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            enviar(
              "/api/unidades",
              {
                proyectoId,
                prototipoId: f.get("prototipoId"),
                torre: f.get("torre"),
                numero: f.get("numero"),
              },
              e.currentTarget
            );
          }}
        >
          <p className="label">Nueva unidad</p>
          <div className="flex gap-2">
            <input name="torre" placeholder="Torre" required />
            <input name="numero" placeholder="Número" required />
          </div>
          <select name="prototipoId" required defaultValue="">
            <option value="" disabled>
              Prototipo…
            </option>
            {prototipos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.clave}
              </option>
            ))}
          </select>
          <button className="btn btn-sm self-start">Agregar</button>
        </form>
      </div>

      {error && <p className="border-t border-line px-6 py-3 text-[13px] text-warm">{error}</p>}
    </details>
  );
}
