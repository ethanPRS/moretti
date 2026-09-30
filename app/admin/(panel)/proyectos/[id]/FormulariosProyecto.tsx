"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SubirImagen from "@/components/SubirImagen";
import { avisar } from "@/components/admin/avisar";

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

type Paso = "prototipos" | "unidades" | "precios" | "datos";

const TITULOS: Record<Paso, string> = {
  prototipos: "Primero, los prototipos.",
  unidades: "Luego, las unidades.",
  precios: "Después, los precios.",
  datos: "Por último, los datos y la foto.",
};

export default function FormulariosProyecto({
  proyectoId,
  prototipos,
  paquetes,
  cuentas,
  tablas,
  datos,
}: {
  proyectoId: string;
  prototipos: Opcion[];
  paquetes: Opcion[];
  cuentas: { prototipos: number; unidades: number; conPrecio: number };
  tablas: { unidades: React.ReactNode; precios: React.ReactNode };
  datos: DatosProyecto;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);

  const PASOS: { id: Paso; titulo: string; cuenta: string; listo: boolean }[] = [
    { id: "prototipos", titulo: "Prototipos", cuenta: String(cuentas.prototipos), listo: cuentas.prototipos > 0 },
    { id: "unidades", titulo: "Unidades", cuenta: String(cuentas.unidades), listo: cuentas.unidades > 0 },
    { id: "precios", titulo: "Precios", cuenta: `${cuentas.conPrecio}/${cuentas.prototipos}`, listo: cuentas.prototipos > 0 && cuentas.conPrecio === cuentas.prototipos },
    { id: "datos", titulo: "Datos e imagen", cuenta: datos.imagen ? "con foto" : "sin foto", listo: Boolean(datos.imagen) },
  ];
  // Arranca en el primer paso que falta; si todo está, en las unidades.
  const [paso, setPaso] = useState<Paso>(PASOS.find((p) => !p.listo)?.id ?? "unidades");

  async function enviar(
    url: string,
    cuerpo: unknown,
    form: HTMLFormElement | null,
    metodo: string,
    listo: (r: Record<string, unknown>) => string
  ) {
    setGuardando(true);
    const res = await fetch(url, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    }).catch(() => null);
    const data = ((await res?.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    setGuardando(false);
    if (!res || !res.ok) {
      avisar.error(typeof data.error === "string" ? data.error : "Revisa tu conexión e intenta de nuevo.");
      return;
    }
    form?.reset();
    avisar.exito(listo(data));
    router.refresh();
  }

  const sinPrototipos = prototipos.length === 0;

  return (
    <section className="flex flex-col gap-5">
      <div>
        <p className="panel-etiqueta">Configurar paso a paso</p>
        <h2 className="mt-2 text-[26px]">{TITULOS[paso]}</h2>
      </div>

      <div className="pasos" role="tablist" aria-label="Pasos para configurar el proyecto">
        {PASOS.map((p, i) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            className="paso"
            aria-selected={paso === p.id}
            data-listo={p.listo ? "" : undefined}
            onClick={() => setPaso(p.id)}
          >
            <span className="paso-n">{p.listo ? "✓" : i + 1}</span>
            {p.titulo}
            <span className="paso-cuenta">{p.cuenta}</span>
          </button>
        ))}
      </div>

      {paso === "prototipos" && (
        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <form
            className="card flex h-fit flex-col gap-4 p-6"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              enviar(
                "/api/prototipos",
                { proyectoId, clave: f.get("clave"), superficie: f.get("superficie"), recamaras: f.get("recamaras") },
                e.currentTarget,
                "POST",
                () => `Prototipo «${f.get("clave")}» agregado.`
              );
            }}
          >
            <div>
              <h3 className="text-[18px]">Nuevo prototipo</h3>
              <p className="mt-1 text-[13.5px] text-ink-2">Cada tipo de departamento. El precio de los paquetes cambia por prototipo.</p>
            </div>
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
            <p className="ayuda -mt-2">Los climas por defecto se calculan solos: uno en la sala y uno por recámara.</p>
            <button className="btn btn-sm self-start" disabled={guardando}>Agregar prototipo</button>
          </form>
          <div className="flex min-w-0 flex-col gap-3">
            <p className="text-[14px] text-ink-2">Prototipos del proyecto y su precio por paquete:</p>
            {tablas.precios}
          </div>
        </div>
      )}

      {paso === "unidades" && (
        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <form
            className="card flex h-fit flex-col gap-4 p-6"
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
                  hasta: f.get("hasta") || undefined,
                },
                e.currentTarget,
                "POST",
                (r) => (Number(r.creadas) > 1 ? `Se agregaron ${r.creadas} unidades.` : "Unidad agregada.")
              );
            }}
          >
            <div>
              <h3 className="text-[18px]">Nuevas unidades</h3>
              <p className="mt-1 text-[13.5px] text-ink-2">Cada departamento que se puede apartar. Agrega una o un rango seguido.</p>
            </div>
            <div className="field">
              <label htmlFor="unidad-prototipo">Prototipo</label>
              <select id="unidad-prototipo" name="prototipoId" required defaultValue="" disabled={sinPrototipos}>
                <option value="" disabled>{sinPrototipos ? "Primero agrega un prototipo" : "Elige el prototipo…"}</option>
                {prototipos.map((p) => (
                  <option key={p.id} value={p.id}>{p.clave}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="torre">Torre</label>
              <input id="torre" name="torre" placeholder="Ej. A" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label htmlFor="numero">Número</label>
                <input id="numero" name="numero" placeholder="Ej. 1201" required />
              </div>
              <div className="field">
                <label htmlFor="hasta">Hasta (opcional)</label>
                <input id="hasta" name="hasta" inputMode="numeric" placeholder="Ej. 1210" />
              </div>
            </div>
            <p className="ayuda -mt-2">Con «hasta» se agregan todas: del 1201 al 1210 son 10 unidades.</p>
            <button className="btn btn-sm self-start" disabled={guardando || sinPrototipos}>Agregar unidades</button>
          </form>
          <div className="flex min-w-0 flex-col gap-3">
            <p className="text-[14px] text-ink-2">Unidades del proyecto. En una libre puedes dar de alta al comprador:</p>
            {tablas.unidades}
          </div>
        </div>
      )}

      {paso === "precios" && (
        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <form
            className="card flex h-fit flex-col gap-4 p-6"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              enviar(
                "/api/precios",
                { prototipoId: f.get("prototipoId"), paqueteId: f.get("paqueteId"), monto: f.get("monto") },
                e.currentTarget,
                "POST",
                () => "Precio guardado. Ya aparece en el cotizador."
              );
            }}
          >
            <div>
              <h3 className="text-[18px]">Precio de un paquete</h3>
              <p className="mt-1 text-[13.5px] text-ink-2">Si ya tenía precio, el nuevo lo reemplaza desde hoy y el anterior queda en el histórico.</p>
            </div>
            <div className="field">
              <label htmlFor="precio-prototipo">Prototipo</label>
              <select id="precio-prototipo" name="prototipoId" required defaultValue="" disabled={sinPrototipos}>
                <option value="" disabled>{sinPrototipos ? "Primero agrega un prototipo" : "Elige el prototipo…"}</option>
                {prototipos.map((p) => (
                  <option key={p.id} value={p.id}>{p.clave}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="precio-paquete">Paquete</label>
              <select id="precio-paquete" name="paqueteId" required defaultValue="">
                <option value="" disabled>Elige el paquete…</option>
                {paquetes.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="monto">Precio con IVA ($)</label>
              <input id="monto" name="monto" type="number" step="100" min={1} placeholder="Ej. 147300" required />
              <p className="ayuda">En pesos enteros, sin comas ni centavos.</p>
            </div>
            <button className="btn btn-sm self-start" disabled={guardando || sinPrototipos}>Guardar precio</button>
          </form>
          <div className="flex min-w-0 flex-col gap-3">
            <p className="text-[14px] text-ink-2">Precio vigente por prototipo y paquete. «—» es que falta.</p>
            {tablas.precios}
          </div>
        </div>
      )}

      {paso === "datos" && (
        <form
          className="card flex flex-col gap-5 p-6 sm:p-8"
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
              () => "Cambios del proyecto guardados."
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
          <button className="btn self-start" disabled={guardando}>{guardando ? "Guardando…" : "Guardar cambios"}</button>
        </form>
      )}
    </section>
  );
}
