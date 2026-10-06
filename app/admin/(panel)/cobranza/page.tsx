import Link from "next/link";
import { connection } from "next/server";
import { PageHead, Money } from "@/components/ui";
import { resumenCobranza, type Alerta } from "@/lib/motor/cobranza";

const CHIP: Record<Alerta["tipo"], { clase: string; texto: string }> = {
  vencida: { clase: "late", texto: "Vencida" },
  suspendido: { clase: "late", texto: "Suspendido" },
  fallido: { clase: "warn", texto: "Cobro rechazado" },
  fiscal_vencido: { clase: "warn", texto: "Fiscal" },
};

/**
 * Tablero de cobranza (actividad V): la cartera por proyecto y las alertas
 * arriba, sin tener que buscarlas.
 */
export default async function CobranzaPage() {
  await connection();
  const { resumen, alertas, mes } = await resumenCobranza();
  const nombreMes = mes.toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "America/Mexico_City" });

  return (
    <div className="flex flex-col gap-9">
      <PageHead
        eyebrow="Cobranza"
        titulo="Cómo va la cartera."
        descripcion={`Por proyecto: vendidos, apartados, al corriente y vencidos. Cobros de ${nombreMes} y cuáles fallaron.`}
      />

      <section className="flex flex-col gap-3">
        <p className="label">Alertas · {alertas.length}</p>
        {alertas.length === 0 ? (
          <p className="note">Sin alertas: nada vencido, suspendido ni rechazado este mes.</p>
        ) : (
          <div className="card divide-y divide-line">
            {alertas.map((a, i) => (
              <Link key={i} href={`/admin/planes/${a.planId}`} className="flex flex-wrap items-center gap-3 p-4 text-[13.5px] hover:bg-surface-2">
                <span className={`chip ${CHIP[a.tipo].clase}`}>{CHIP[a.tipo].texto}</span>
                <span className="font-medium">{a.comprador}</span>
                <span className="text-muted">{a.unidad}</span>
                <span className="text-ink-2">{a.texto}</span>
              </Link>
            ))}
          </div>
        )}
        <p className="text-[12.5px] text-muted">
          Las tarjetas por vencer (dos meses antes) aparecen aquí cuando se guarde la vigencia de la tarjeta (tarea P de Charly).
        </p>
      </section>

      {resumen.map((p) => (
        <section key={p.id} className="flex flex-col gap-3">
          <p className="label">{p.nombre}</p>
          <div className="card grid grid-cols-2 gap-6 p-6 sm:grid-cols-3 lg:grid-cols-6">
            <Dato k="Vendidos" v={`${p.vendidos} de ${p.unidades}`} />
            <Dato k="Apartados" v={p.apartados} />
            <Dato k="Al corriente" v={p.alCorriente} />
            <Dato k="Liquidados" v={p.liquidados} />
            <Dato k="Con vencidas" v={p.conVencidas} alerta={p.conVencidas > 0} />
            <Dato k="Suspendidos" v={p.suspendidos} alerta={p.suspendidos > 0} />
          </div>
          <div className="card grid grid-cols-2 gap-6 p-6 sm:grid-cols-4">
            <Dato k={`Cobrado en ${nombreMes}`} v={<Money valor={p.cobradoMes} />} />
            <Dato k="Por cobrar este mes" v={<Money valor={p.porCobrarMes} />} />
            <Dato k="Cobros del mes" v={p.cobrosMes} />
            <Dato k="Rechazados del mes" v={p.fallidosMes} alerta={p.fallidosMes > 0} />
          </div>
        </section>
      ))}
    </div>
  );
}

function Dato({ k, v, alerta }: { k: string; v: React.ReactNode; alerta?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted">{k}</p>
      <p className={`mt-1 text-[22px] font-semibold ${alerta ? "text-warm" : ""}`}>{v}</p>
    </div>
  );
}
