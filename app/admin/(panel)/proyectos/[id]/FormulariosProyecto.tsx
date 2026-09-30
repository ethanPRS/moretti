"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SubirImagen from "@/components/SubirImagen";

type Opcion = { id: string; nombre?: string; clave?: string };

export type DatosProyecto = {
  nombre: string;
  numeroUnidades: number;
  porcentajeAnticipo: number;
  porcentajeComision: number;
  minimoPlan: number;
  fechaEntregaUnidades: string | null;
  imagen: string | null;
};

/** Un paso del alta del proyecto: título, para qué sirve y su formulario. */
function Paso({ n, titulo, texto, children }: { n: number; titulo: string; texto: string; children: React.ReactNode }) {
  return (
    <div className="card flex flex-col gap-4 p-6">
      <div>
        <p className="font-mono text-[12px] text-muted">Paso {n}</p>
        <h3 className="mt-1 text-[18px]">{titulo}</h3>
        <p className="mt-1 text-[13.5px] text-ink-2">{texto}</p>
      </div>
      {children}
    </div>
  );
}

export default function FormulariosProyecto({
  proyectoId,
  prototipos,
  paquetes,
  datos,
}: {
  proyectoId: string;
  prototipos: Opcion[];
  paquetes: Opcion[];
  datos: DatosProyecto;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function enviar(url: string, cuerpo: unknown, form: HTMLFormElement | null, metodo = "POST", listo = "Guardado.") {
    setError(null);
    setAviso(null);
    const res = await fetch(url, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar.");
      return;
    }
    form?.reset();
    setAviso(listo);
    router.refresh();
  }

  const sinPrototipos = prototipos.length === 0;

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="note blocked" role="alert">{error}</p>}
      {aviso && <p className="note" role="status">{aviso}</p>}

      <div className="grid gap-5 lg:grid-cols-3">
        <Paso n={1} titulo="Agregar un prototipo" texto="Cada tipo de departamento del desarrollo. El precio de los paquetes cambia por prototipo.">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              enviar("/api/prototipos", { proyectoId, clave: f.get("clave"), superficie: f.get("superficie"), recamaras: f.get("recamaras") }, e.currentTarget, "POST", "Prototipo agregado.");
            }}
          >
            <div className="field">
              <label htmlFor="clave">Clave</label>
              <input id="clave" name="clave" placeholder="Ej. DEPA 2R (tipo 717)" required />
              <p className="ayuda">Como viene en los planos del desarrollador.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label htmlFor="superficie">Superficie (m²)</label>
                <input id="superficie" name="superficie" type="number" step="0.01" min={1} placeholder="Ej. 68.5" required />
              </div>
              <div className="field">
                <label htmlFor="recamaras">Recámaras</label>
                <input id="recamaras" name="recamaras" type="number" min={0} placeholder="Ej. 2" required />
              </div>
            </div>
            <button className="btn btn-sm self-start">Agregar prototipo</button>
          </form>
        </Paso>

        <Paso n={2} titulo="Agregar una unidad" texto="Cada departamento que se puede vender, con su torre y número.">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              enviar("/api/unidades", { proyectoId, prototipoId: f.get("prototipoId"), torre: f.get("torre"), numero: f.get("numero") }, e.currentTarget, "POST", "Unidad agregada.");
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label htmlFor="torre">Torre</label>
                <input id="torre" name="torre" placeholder="Ej. A" required />
              </div>
              <div className="field">
                <label htmlFor="numero">Número</label>
                <input id="numero" name="numero" placeholder="Ej. 1204" required />
              </div>
            </div>
            <div className="field">
              <label htmlFor="unidad-prototipo">Prototipo</label>
              <select id="unidad-prototipo" name="prototipoId" required defaultValue="" disabled={sinPrototipos}>
                <option value="" disabled>{sinPrototipos ? "Primero agrega un prototipo" : "Elige el prototipo…"}</option>
                {prototipos.map((p) => <option key={p.id} value={p.id}>{p.clave}</option>)}
              </select>
            </div>
            <button className="btn btn-sm self-start" disabled={sinPrototipos}>Agregar unidad</button>
          </form>
        </Paso>

        <Paso n={3} titulo="Poner precio a un paquete" texto="Lo que cuesta cada paquete en cada prototipo. Si ya tenía precio, el nuevo lo reemplaza desde hoy.">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              enviar("/api/precios", { prototipoId: f.get("prototipoId"), paqueteId: f.get("paqueteId"), monto: f.get("monto") }, e.currentTarget, "POST", "Precio guardado.");
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label htmlFor="precio-prototipo">Prototipo</label>
                <select id="precio-prototipo" name="prototipoId" required defaultValue="" disabled={sinPrototipos}>
                  <option value="" disabled>Elige…</option>
                  {prototipos.map((p) => <option key={p.id} value={p.id}>{p.clave}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="precio-paquete">Paquete</label>
                <select id="precio-paquete" name="paqueteId" required defaultValue="">
                  <option value="" disabled>Elige…</option>
                  {paquetes.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="monto">Precio con IVA ($)</label>
              <input id="monto" name="monto" type="number" step="100" min={1} placeholder="Ej. 147300" required />
              <p className="ayuda">En pesos enteros, sin comas ni centavos.</p>
            </div>
            <button className="btn btn-sm self-start" disabled={sinPrototipos}>Guardar precio</button>
          </form>
        </Paso>
      </div>

      <details className="card group p-0">
        <summary className="cursor-pointer list-none px-6 py-4 text-[15px] font-semibold marker:content-none">
          <span className="text-accent group-open:hidden">+ </span>
          <span className="hidden text-accent group-open:inline">− </span>
          Editar datos e imagen del proyecto
        </summary>
        <form
          className="flex flex-col gap-5 border-t border-line p-6"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            enviar(
              `/api/proyectos/${proyectoId}`,
              {
                nombre: f.get("nombre"),
                numeroUnidades: f.get("numeroUnidades"),
                porcentajeAnticipo: Number(f.get("porcentajeAnticipo")) / 100,
                porcentajeComision: Number(f.get("porcentajeComision")) / 100,
                minimoPlan: f.get("minimoPlan"),
                fechaEntregaUnidades: f.get("fechaEntregaUnidades") || null,
                imagen: f.get("imagen") || null,
              },
              null,
              "PATCH",
              "Datos del proyecto guardados."
            );
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="p-nombre">Nombre del proyecto</label>
              <input id="p-nombre" name="nombre" defaultValue={datos.nombre} required />
            </div>
            <div className="field">
              <label htmlFor="p-fecha">Entrega estimada</label>
              <input id="p-fecha" name="fechaEntregaUnidades" type="date" defaultValue={datos.fechaEntregaUnidades ?? ""} />
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-4">
            <div className="field">
              <label htmlFor="p-unidades">Departamentos</label>
              <input id="p-unidades" name="numeroUnidades" type="number" min={1} defaultValue={datos.numeroUnidades} required />
            </div>
            <div className="field">
              <label htmlFor="p-anticipo">Anticipo (%)</label>
              <input id="p-anticipo" name="porcentajeAnticipo" type="number" step="0.01" defaultValue={datos.porcentajeAnticipo} required />
            </div>
            <div className="field">
              <label htmlFor="p-comision">Comisión (%)</label>
              <input id="p-comision" name="porcentajeComision" type="number" step="0.01" defaultValue={datos.porcentajeComision} required />
            </div>
            <div className="field">
              <label htmlFor="p-minimo">Mínimo a financiar ($)</label>
              <input id="p-minimo" name="minimoPlan" type="number" step="100" defaultValue={datos.minimoPlan} required />
            </div>
          </div>
          <p className="ayuda -mt-2">
            Cambiar el anticipo, la comisión o el mínimo sólo afecta planes nuevos: los apartados conservan sus condiciones.
          </p>
          <SubirImagen name="imagen" inicial={datos.imagen} etiqueta="Foto del proyecto" />
          <button className="btn btn-sm self-start">Guardar cambios</button>
        </form>
      </details>
    </div>
  );
}
