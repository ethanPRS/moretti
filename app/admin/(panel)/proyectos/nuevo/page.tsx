"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SubirImagen from "@/components/SubirImagen";

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
        minimoPlan: f.get("minimoPlan"),
        fechaEntregaUnidades: f.get("fechaEntregaUnidades") || null,
        imagen: f.get("imagen") || null,
      }),
    });
    setCargando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo crear el proyecto.");
      return;
    }
    const proyecto = await res.json();
    router.push(`/admin/proyectos/${proyecto.id}`);
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="eyebrow">Pipeline</p>
        <h1 className="mt-2 text-[clamp(28px,4vw,40px)]">Nuevo proyecto</h1>
        <p className="mt-3 max-w-[60ch] text-ink-2">
          Un proyecto es un desarrollo inmobiliario donde se venden paquetes. Después de
          crearlo, en su ficha se agregan los prototipos, sus precios y las unidades.
        </p>
      </div>

      <form onSubmit={onSubmit} className="card flex max-w-2xl flex-col gap-7 p-7 sm:p-9">
        <fieldset className="flex flex-col gap-5">
          <legend className="mb-4 text-[18px] font-semibold">¿Qué desarrollo es?</legend>
          <div className="field">
            <label htmlFor="desarrolladorNombre">Desarrollador</label>
            <input id="desarrolladorNombre" name="desarrolladorNombre" placeholder="Ej. PISSA" required />
            <p className="ayuda">La empresa que construye y vende los departamentos. Si ya existe, se reutiliza.</p>
          </div>
          <div className="field">
            <label htmlFor="nombre">Nombre del proyecto</label>
            <input id="nombre" name="nombre" placeholder="Ej. Barrio Roble" required />
            <p className="ayuda">Como lo conoce el comprador. Aparece en el sitio y en el contrato.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="numeroUnidades">Número de departamentos</label>
              <input id="numeroUnidades" name="numeroUnidades" type="number" min={1} placeholder="Ej. 120" required />
              <p className="ayuda">Todas las unidades del desarrollo, vendidas o no.</p>
            </div>
            <div className="field">
              <label htmlFor="fechaEntregaUnidades">Entrega estimada</label>
              <input id="fechaEntregaUnidades" name="fechaEntregaUnidades" type="date" />
              <p className="ayuda">Cuándo el desarrollador entrega llaves. Opcional; se puede cambiar después.</p>
            </div>
          </div>
          <SubirImagen
            name="imagen"
            etiqueta="Foto del proyecto"
            ayuda="Render o fachada del desarrollo, horizontal. JPG, PNG o WebP de hasta 8 MB."
          />
        </fieldset>

        <fieldset className="flex flex-col gap-5 border-t border-line pt-7">
          <legend className="mb-1 text-[18px] font-semibold">Condiciones del plan</legend>
          <p className="-mt-1 text-[14px] text-ink-2">
            Cada desarrollador puede negociar las suyas. Aplican a todos los planes de este
            proyecto.
          </p>
          <div className="grid gap-5 sm:grid-cols-3">
            <div className="field">
              <label htmlFor="porcentajeAnticipo">Anticipo (%)</label>
              <input id="porcentajeAnticipo" name="porcentajeAnticipo" type="number" step="0.01" min={0} max={100} defaultValue="30" required />
              <p className="ayuda">Lo que paga el comprador al apartar. Ej. 30.</p>
            </div>
            <div className="field">
              <label htmlFor="porcentajeComision">Comisión día uno (%)</label>
              <input id="porcentajeComision" name="porcentajeComision" type="number" step="0.01" min={0} max={100} defaultValue="15" required />
              <p className="ayuda">Se separa de cada cobro. Ej. 15.</p>
            </div>
            <div className="field">
              <label htmlFor="minimoPlan">Mínimo a financiar ($)</label>
              <input id="minimoPlan" name="minimoPlan" type="number" step="100" min={0} defaultValue="50000" required />
              <p className="ayuda">Debajo de este total se paga de contado. Ej. 50000.</p>
            </div>
          </div>
        </fieldset>

        {error && <p className="note blocked" role="alert">{error}</p>}
        <button disabled={cargando} className="btn self-start">
          {cargando ? "Creando…" : "Crear proyecto"}
        </button>
      </form>
    </div>
  );
}
