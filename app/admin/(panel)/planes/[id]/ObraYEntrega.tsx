"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/admin/avisar";
import type { EstadoFinanciero } from "@/lib/motor/estados";
import {
  ETIQUETA_INSTALACION,
  ETIQUETA_OPERATIVO,
  ORDEN_INSTALACION,
  ORDEN_OPERATIVO,
  faltantesInstalacion,
  faltantesOperativo,
  siguienteInstalacion,
  siguienteOperativo,
  type EstadoInstalacion,
  type EstadoOperativo,
} from "@/lib/motor/operacion";

/**
 * Obra y entrega (actividad Q): las máquinas operativa y de instalación, con
 * el siguiente paso de cada una. Si falta algo, lo dice antes de intentar;
 * el motor lo vuelve a validar.
 */
export default function ObraYEntrega({
  unidadId,
  financiero,
  operativo,
  instalacion,
  partidasSinAcabado,
  acta,
}: {
  unidadId: string;
  financiero: EstadoFinanciero;
  operativo: EstadoOperativo;
  instalacion: EstadoInstalacion;
  partidasSinAcabado: string[];
  acta: { quienFirmo: string; fecha: string; archivo: string } | null;
}) {
  const router = useRouter();
  const [cargando, setCargando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const expediente = { financiero, operativo, instalacion, partidasSinAcabado, actaEntregaFirmada: Boolean(acta) };

  const sigOp = siguienteOperativo(operativo);
  const sigIn = siguienteInstalacion(instalacion);
  const faltanOp = sigOp ? faltantesOperativo(expediente, sigOp) : [];
  const faltanIn = sigIn ? faltantesInstalacion(expediente, sigIn) : [];

  async function enviar(url: string, cuerpo: unknown, exito: string, clave: string) {
    setError(null);
    setCargando(clave);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    setCargando(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data.error ?? "No se pudo guardar.";
      avisar.error(msg);
      setError(msg);
      return false;
    }
    avisar.exito(exito);
    router.refresh();
    return true;
  }

  async function registrarActa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await enviar(
      `/api/unidades/${unidadId}/acta-entrega`,
      { archivoNombre: f.get("archivoNombre"), quienFirmo: f.get("quienFirmo"), fechaFirma: f.get("fechaFirma") },
      "Acta de entrega registrada.",
      "acta"
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <p className="label">Obra y entrega</p>
        <p className="mt-1.5 max-w-[70ch] text-[13px] text-ink-2">
          Avanzan de un paso en uno y no retroceden. Con el estado financiero suspendido o cancelado
          no avanzan. Desde el levantamiento ya no se cambian paquete ni acabados (R6).
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Maquina
          titulo="Operativa"
          pasos={ORDEN_OPERATIVO.map((e) => ETIQUETA_OPERATIVO[e])}
          actual={ORDEN_OPERATIVO.indexOf(operativo)}
          siguiente={sigOp ? ETIQUETA_OPERATIVO[sigOp] : null}
          faltan={faltanOp}
          cargando={cargando === "op"}
          onAvanzar={() =>
            sigOp &&
            enviar(
              `/api/unidades/${unidadId}/obra`,
              { maquina: "operativa", hacia: sigOp },
              `Operativa: ${ETIQUETA_OPERATIVO[sigOp]}.`,
              "op"
            )
          }
        />
        <Maquina
          titulo="Instalación"
          pasos={ORDEN_INSTALACION.map((e) => ETIQUETA_INSTALACION[e])}
          actual={ORDEN_INSTALACION.indexOf(instalacion)}
          siguiente={sigIn ? ETIQUETA_INSTALACION[sigIn] : null}
          faltan={faltanIn}
          cargando={cargando === "in"}
          onAvanzar={() =>
            sigIn &&
            enviar(
              `/api/unidades/${unidadId}/obra`,
              { maquina: "instalacion", hacia: sigIn },
              `Instalación: ${ETIQUETA_INSTALACION[sigIn]}.`,
              "in"
            )
          }
        />
      </div>

      {acta ? (
        <p className="text-[13px] text-ink-2">
          Acta de entrega firmada por <b>{acta.quienFirmo}</b> el {acta.fecha} ({acta.archivo}).
        </p>
      ) : (
        <details className="card p-5">
          <summary className="cursor-pointer text-[14px] font-medium text-ink-2">
            Registrar el acta de entrega firmada
          </summary>
          <form onSubmit={registrarActa} className="mt-4 flex flex-col gap-3">
            <p className="text-[13px] text-ink-2">Sin el acta firmada no se marca la unidad como entregada.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <input name="archivoNombre" placeholder="Archivo (ej. acta-717.pdf)" required />
              <input name="quienFirmo" placeholder="Quién firmó" required />
              <input name="fechaFirma" type="date" required />
            </div>
            <button disabled={cargando === "acta"} className="btn btn-sm self-start">
              {cargando === "acta" ? "Registrando…" : "Registrar acta"}
            </button>
          </form>
        </details>
      )}

      {error && (
        <p role="alert" className="text-[13px] text-warm">
          {error}
        </p>
      )}
    </section>
  );
}

function Maquina(p: {
  titulo: string;
  pasos: string[];
  actual: number;
  siguiente: string | null;
  faltan: string[];
  cargando: boolean;
  onAvanzar: () => void;
}) {
  return (
    <div className="card flex flex-col gap-4 p-5">
      <p className="text-[14px] font-medium">{p.titulo}</p>
      <ol className="flex flex-col gap-1.5 text-[13px]">
        {p.pasos.map((paso, i) => (
          <li key={paso} className={i === p.actual ? "font-semibold" : i < p.actual ? "text-ink-2" : "text-muted"}>
            {i < p.actual ? "✓ " : i === p.actual ? "● " : "○ "}
            {paso}
          </li>
        ))}
      </ol>
      {p.siguiente ? (
        <div className="flex flex-col gap-2">
          {p.faltan.length > 0 && (
            <p className="text-[12.5px] text-muted">
              Para pasar a {p.siguiente} falta: {p.faltan.join("; ")}.
            </p>
          )}
          <button
            type="button"
            onClick={p.onAvanzar}
            disabled={p.cargando || p.faltan.length > 0}
            className="btn btn-sm self-start"
          >
            {p.cargando ? "Guardando…" : `Pasar a ${p.siguiente}`}
          </button>
        </div>
      ) : (
        <p className="text-[12.5px] text-muted">Terminada.</p>
      )}
    </div>
  );
}
