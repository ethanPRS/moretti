"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NuevoProyectoPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/proyectos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        desarrolladorNombre: f.get("desarrolladorNombre"),
        nombre: f.get("nombre"),
        numeroUnidades: f.get("numeroUnidades"),
        porcentajeAnticipo: Number(f.get("porcentajeAnticipo")) / 100,
        porcentajeComision: Number(f.get("porcentajeComision")) / 100,
      }),
    });
    setCargando(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "No se pudo crear el proyecto.");
      return;
    }
    const proyecto = await res.json();
    router.push(`/proyectos/${proyecto.id}`);
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="eyebrow">Pipeline</p>
        <h1 className="mt-2 text-[clamp(28px,4vw,40px)]">Nuevo proyecto</h1>
        <p className="mt-3 max-w-[58ch] text-ink-2">
          El anticipo y la comisión viven en el proyecto, no en el código: cada desarrollador puede
          negociar los suyos.
        </p>
      </div>

      <form onSubmit={onSubmit} className="card flex max-w-xl flex-col gap-5 p-7">
        <div className="field">
          <label htmlFor="desarrolladorNombre">Desarrollador</label>
          <input id="desarrolladorNombre" name="desarrolladorNombre" required />
        </div>
        <div className="field">
          <label htmlFor="nombre">Nombre del proyecto</label>
          <input id="nombre" name="nombre" required />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="field">
            <label htmlFor="numeroUnidades">Unidades</label>
            <input id="numeroUnidades" name="numeroUnidades" type="number" required />
          </div>
          <div className="field">
            <label htmlFor="porcentajeAnticipo">% anticipo</label>
            <input
              id="porcentajeAnticipo"
              name="porcentajeAnticipo"
              type="number"
              step="0.01"
              defaultValue="30"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="porcentajeComision">% comisión</label>
            <input
              id="porcentajeComision"
              name="porcentajeComision"
              type="number"
              step="0.01"
              defaultValue="15"
              required
            />
          </div>
        </div>
        {error && <p className="text-[13.5px] text-warm">{error}</p>}
        <button disabled={cargando} className="btn self-start">
          {cargando ? "Creando…" : "Crear proyecto"}
        </button>
      </form>
    </div>
  );
}
