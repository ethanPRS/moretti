"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/admin/avisar";
import {
  ETIQUETA_FINANCIERO,
  TRANSICIONES_FINANCIERAS,
  esManual,
  type EstadoFinanciero,
} from "@/lib/motor/estados";

/**
 * Suspender, reactivar o cancelar a mano (S1-13). Sólo ofrece lo que la
 * máquina permite hacer a mano desde el estado actual; el motor lo vuelve a
 * validar.
 */
export default function EstadoFinancieroForm({
  unidadId,
  estado,
}: {
  unidadId: string;
  estado: EstadoFinanciero;
}) {
  const router = useRouter();
  const opciones = TRANSICIONES_FINANCIERAS[estado].filter((h) => esManual(estado, h));
  const [hacia, setHacia] = useState<EstadoFinanciero | "">("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  if (opciones.length === 0) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hacia) return;
    setError(null);
    setCargando(true);
    const res = await fetch(`/api/unidades/${unidadId}/estado-financiero`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hacia, motivo }),
    });
    setCargando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data.error ?? "No se pudo cambiar el estado.";
      avisar.error(msg);
      setError(msg);
      return;
    }
    avisar.exito("Estado del plan actualizado.");
    setHacia("");
    setMotivo("");
    router.refresh();
  }

  return (
    <details className="card p-5">
      <summary className="cursor-pointer text-[14px] font-medium text-ink-2">
        Cambiar el estado financiero a mano
      </summary>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
        <p className="text-[13px] text-ink-2">
          Hoy está en <b>{ETIQUETA_FINANCIERO[estado]}</b>. Apartado, al corriente y liquidado
          llegan solos con los cobros; a mano sólo se suspende, se reactiva o se cancela.
        </p>
        <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
          <select value={hacia} onChange={(e) => setHacia(e.target.value as EstadoFinanciero)} required>
            <option value="">Pasar a…</option>
            {opciones.map((o) => (
              <option key={o} value={o}>
                {ETIQUETA_FINANCIERO[o]}
              </option>
            ))}
          </select>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={hacia === "CANCELADO" ? "Motivo (obligatorio al cancelar)" : "Motivo"}
            required={hacia === "CANCELADO"}
          />
        </div>
        {error && (
          <p role="alert" className="text-[13px] text-warm">
            {error}
          </p>
        )}
        <button disabled={cargando || !hacia} className="btn btn-sm self-start">
          {cargando ? "Guardando…" : "Cambiar estado"}
        </button>
      </form>
    </details>
  );
}
