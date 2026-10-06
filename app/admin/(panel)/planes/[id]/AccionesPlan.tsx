"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/admin/avisar";
import { Money } from "@/components/ui";
import type { VistaPrevia } from "@/lib/motor/versiones";
import type { VistaUpgrade } from "@/lib/motor/upgrade";

type Accion = "adelanto" | "liquidacion" | "upgrade";

/**
 * Pantalla de acciones (actividad R): adelanto y liquidación anticipada, con
 * la vista previa de cómo queda el plan antes de confirmar. Sólo en el back
 * office: la liquidación no se promociona ni aparece en el portal.
 */
export default function AccionesPlan({
  planId,
  saldo,
  paquetesMayores,
  bloqueoUpgrade,
}: {
  planId: string;
  saldo: number;
  /** Paquetes cerrados de nivel mayor con precio vigente; vacío si no aplica. */
  paquetesMayores: { id: string; nombre: string }[];
  /** Por qué no procede un upgrade (R6, modalidad), o null. */
  bloqueoUpgrade: string | null;
}) {
  const router = useRouter();
  const [accion, setAccion] = useState<Accion>("adelanto");
  const [monto, setMonto] = useState("");
  const [vista, setVista] = useState<VistaPrevia | null>(null);
  const [vistaUp, setVistaUp] = useState<VistaUpgrade | null>(null);
  const [paqueteId, setPaqueteId] = useState(paquetesMayores[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function pedir(confirmar: boolean) {
    setError(null);
    setCargando(true);
    const res = await fetch(`/api/planes/${planId}/recalculo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        accion === "adelanto"
          ? { accion, monto, confirmar }
          : accion === "upgrade"
            ? { accion, paqueteId, confirmar }
            : { accion, confirmar }
      ),
    });
    const data = await res.json().catch(() => ({}));
    setCargando(false);
    if (!res.ok && res.status !== 202) {
      const msg = data.error ?? "No se pudo hacer el recálculo.";
      setError(msg);
      avisar.error(msg);
      if (confirmar) {
        setVista(null);
        setVistaUp(null);
        router.refresh();
      }
      return;
    }
    if (!confirmar) {
      if (accion === "upgrade") setVistaUp(data.vista);
      else setVista(data.vista);
      return;
    }
    avisar.exito(
      res.status === 202
        ? data.mensaje
        : `${accion === "adelanto" ? "Adelanto cobrado" : accion === "upgrade" ? "Upgrade aplicado y diferencia cobrada" : "Plan liquidado"}. Versión ${data.version} del plan.`
    );
    setVista(null);
    setVistaUp(null);
    setMonto("");
    router.refresh();
  }

  function cambiar(a: Accion) {
    setAccion(a);
    setVista(null);
    setVistaUp(null);
    setError(null);
  }

  return (
    <details className="card p-5">
      <summary className="cursor-pointer text-[14px] font-medium text-ink-2">
        Adelanto, liquidación anticipada o upgrade
      </summary>
      <div className="mt-4 flex flex-col gap-4">
        <div className="flex gap-2" role="tablist">
          <button type="button" onClick={() => cambiar("adelanto")} className={`btn btn-sm ${accion === "adelanto" ? "" : "btn-ghost"}`}>
            Adelanto
          </button>
          <button type="button" onClick={() => cambiar("liquidacion")} className={`btn btn-sm ${accion === "liquidacion" ? "" : "btn-ghost"}`}>
            Liquidación anticipada
          </button>
          <button type="button" onClick={() => cambiar("upgrade")} className={`btn btn-sm ${accion === "upgrade" ? "" : "btn-ghost"}`}>
            Upgrade de paquete
          </button>
        </div>

        {accion === "upgrade" ? (
          <div className="flex flex-col gap-3">
            <p className="max-w-[70ch] text-[13px] text-ink-2">
              Conserva el precio congelado y le suma la diferencia entre paquetes (a precio de hoy). Hoy se
              cobra el % de anticipo de la diferencia; el resto se reparte en las exhibiciones que quedan,
              sin alargar el plan.
            </p>
            {bloqueoUpgrade ? (
              <p className="note blocked">{bloqueoUpgrade}</p>
            ) : paquetesMayores.length === 0 ? (
              <p className="text-[13px] text-muted">No hay un paquete mayor con precio vigente para este prototipo.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={paqueteId}
                  onChange={(e) => {
                    setPaqueteId(e.target.value);
                    setVistaUp(null);
                  }}
                  aria-label="Paquete nuevo"
                >
                  {paquetesMayores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => pedir(false)} disabled={cargando || !paqueteId} className="btn btn-sm btn-ghost">
                  {cargando && !vistaUp ? "Calculando…" : "Ver cómo queda"}
                </button>
              </div>
            )}
          </div>
        ) : accion === "adelanto" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              pedir(false);
            }}
            className="flex flex-col gap-3"
          >
            <p className="max-w-[70ch] text-[13px] text-ink-2">
              Reduce el número de exhibiciones, no su monto: paga las siguientes completas y el
              sobrante menor a una exhibición se abona a la última. Lo ya cobrado no cambia.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={monto}
                onChange={(e) => {
                  setMonto(e.target.value);
                  setVista(null);
                }}
                inputMode="decimal"
                placeholder="Monto en pesos"
                className="w-48"
                required
              />
              <button disabled={cargando || !monto} className="btn btn-sm btn-ghost">
                {cargando && !vista ? "Calculando…" : "Ver cómo queda"}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="max-w-[70ch] text-[13px] text-ink-2">
              Cobra el saldo de <Money valor={saldo} /> en un solo cargo, sin descuento. Cierra el plan
              y cancela las exhibiciones pendientes.
            </p>
            <button type="button" onClick={() => pedir(false)} disabled={cargando} className="btn btn-sm btn-ghost self-start">
              {cargando && !vista ? "Calculando…" : "Ver cómo queda"}
            </button>
          </div>
        )}

        {vistaUp && (
          <div className="flex flex-col gap-3 rounded-lg border border-line p-4">
            <p className="text-[13.5px]">
              {vistaUp.paqueteActual} → <b>{vistaUp.paqueteNuevo}</b>. Total: <Money valor={vistaUp.totalAntes} /> →{" "}
              <b><Money valor={vistaUp.totalDespues} /></b> (+<Money valor={vistaUp.diferencia} />). Se cobra{" "}
              <b><Money valor={vistaUp.cobroHoy} /></b> hoy.
            </p>
            <p className="text-[13px] text-ink-2">
              Mensualidad: <Money valor={vistaUp.mensualidadAntes} /> → <b><Money valor={vistaUp.mensualidadDespues} /></b>,
              las mismas {vistaUp.exhibiciones} exhibiciones. Se agrega:{" "}
              {vistaUp.partidasNuevas.map((p) => `${p.nombre}${p.cantidad > 1 ? ` ×${p.cantidad}` : ""}`).join(", ")}.
            </p>
            <p className="text-[12.5px] text-muted">
              Al confirmar se crea una versión nueva; la actual sigue consultable. Si el banco rechaza el cobro, el
              paquete y el calendario vuelven a como están.
            </p>
            <button type="button" onClick={() => pedir(true)} disabled={cargando} className="btn btn-sm self-start">
              {cargando ? "Cobrando…" : `Confirmar upgrade y cobrar la diferencia`}
            </button>
          </div>
        )}

        {vista && (
          <div className="flex flex-col gap-3 rounded-lg border border-line p-4">
            <p className="text-[13.5px]">
              Se cobra <b><Money valor={vista.cobro} /></b> hoy. Saldo: <Money valor={vista.saldoAntes} /> →{" "}
              <b><Money valor={vista.saldoDespues} /></b>. Exhibiciones por cobrar: {vista.exhibicionesAntes} →{" "}
              <b>{vista.exhibicionesDespues}</b>.
            </p>
            {vista.cubiertas.length > 0 && (
              <p className="text-[13px] text-ink-2">
                {accion === "adelanto" ? "Se pagan por adelantado" : "Se cancelan"}:{" "}
                {vista.cubiertas.map((c) => `la ${c.numero}`).join(", ")}.
              </p>
            )}
            {vista.quedan.length > 0 && (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Fecha</th>
                    <th className="r">Monto</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {vista.quedan.map((q) => (
                    <tr key={q.numero}>
                      <td className="text-muted">{q.numero}</td>
                      <td>{new Date(q.fechaProgramada).toLocaleDateString("es-MX")}</td>
                      <td className="r">
                        <Money valor={q.monto} />
                      </td>
                      <td>{q.cambio === "reducida" && <span className="chip info">Recibe el sobrante</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-[12.5px] text-muted">
              Al confirmar se crea una versión nueva del plan; la actual sigue consultable. Si el banco
              rechaza el cargo, el calendario vuelve a quedar como está.
            </p>
            <button type="button" onClick={() => pedir(true)} disabled={cargando} className="btn btn-sm self-start">
              {cargando ? "Cobrando…" : `Confirmar y cobrar ${accion === "adelanto" ? "el adelanto" : "la liquidación"}`}
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-[13px] text-warm">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
