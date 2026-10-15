import Link from "next/link";
import { connection } from "next/server";
import { PageHead, Money } from "@/components/ui";
import { Estado, Iniciales } from "@/components/admin/Bo";
import { resumenCobranza, type Alerta } from "@/lib/motor/cobranza";

const CHIP: Record<Alerta["tipo"], { clase: string; texto: string }> = {
  vencida: { clase: "late", texto: "Vencida" },
  suspendido: { clase: "late", texto: "Suspendido" },
  fallido: { clase: "warn", texto: "Cobro rechazado" },
  fiscal_vencido: { clase: "warn", texto: "Fiscal" },
  tarjeta_por_vencer: { clase: "warn", texto: "Tarjeta por vencer" },
};

/**
 * Tablero de cobranza (actividad V): primero el mes y las alertas, después
 * la cartera de cada proyecto como una barra (D-47).
 */
export default async function CobranzaPage() {
  await connection();
  const { resumen, alertas, mes } = await resumenCobranza();
  const nombreMes = mes.toLocaleDateString("es-MX", { month: "long", timeZone: "America/Mexico_City" });

  const suma = (k: "cobradoMes" | "porCobrarMes" | "cobrosMes" | "fallidosMes" | "vendidos" | "unidades") =>
    resumen.reduce((a, p) => a + p[k], 0);

  return (
    <div className="flex flex-col gap-8">
      <PageHead
        eyebrow="Cobranza"
        titulo="Cómo va la cartera."
        descripcion={`Lo cobrado en ${nombreMes}, lo que falta y quién necesita atención.`}
      />

      <div className="bo-hero">
        <div className="bo-principal">
          <p className="bo-k">Cobrado en {nombreMes}</p>
          <p className="bo-v"><Money valor={suma("cobradoMes")} /></p>
          <p className="bo-nota">{suma("cobrosMes")} cobros</p>
        </div>
        <div>
          <p className="bo-k">Por cobrar</p>
          <p className="bo-v"><Money valor={suma("porCobrarMes")} /></p>
          <p className="bo-nota">Lo que falta del mes</p>
        </div>
        <div>
          <p className="bo-k">Rechazados</p>
          <p className={`bo-v ${suma("fallidosMes") ? "alerta" : ""}`}>{suma("fallidosMes")}</p>
          <p className="bo-nota">Cobros del mes</p>
        </div>
        <div>
          <p className="bo-k">Vendidos</p>
          <p className="bo-v">{suma("vendidos")}<span className="text-[16px] text-muted"> / {suma("unidades")}</span></p>
          <p className="bo-nota">Unidades con paquete</p>
        </div>
      </div>

      {alertas.length === 0 ? (
        <Estado tipo="ok" titulo="Todo en orden">Nada vencido, suspendido, rechazado ni tarjetas por vencer.</Estado>
      ) : (
        <section className="bo-seccion">
          <Estado tipo="aviso" titulo={`${alertas.length} ${alertas.length === 1 ? "comprador necesita" : "compradores necesitan"} atención`}>
            Ábrelos para ver su plan y qué falta.
          </Estado>
          <div className="bo-lista">
            {alertas.map((a, i) => (
              <Link key={i} href={`/admin/planes/${a.planId}`} className="bo-fila" style={{ gridTemplateColumns: "auto minmax(0,1fr) auto" }}>
                <Iniciales nombre={a.comprador} />
                <div className="bo-quien">
                  <b>{a.comprador}</b>
                  <span>{a.unidad} · {a.texto}</span>
                </div>
                <span className={`chip ${CHIP[a.tipo].clase}`}>{CHIP[a.tipo].texto}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="bo-seccion">
        <div className="bo-seccion-t">
          <h2>Por proyecto</h2>
          <span>Cada barra es el total de unidades del desarrollo.</span>
        </div>
        {resumen.map((p) => {
          const libres = Math.max(0, p.unidades - p.vendidos);
          const partes = [
            { n: p.alCorriente, c: "c-corriente", t: "Al corriente" },
            { n: p.apartados, c: "c-apartado", t: "Apartados" },
            { n: p.liquidados, c: "c-liquidado", t: "Liquidados" },
            { n: p.suspendidos, c: "c-suspendido", t: "Suspendidos" },
            { n: libres, c: "c-libre", t: "Sin vender" },
          ];
          return (
            <div key={p.id} className="bo-card bo-proy">
              <div>
                <div className="bo-proy-cab">
                  <h3>{p.nombre}</h3>
                  <p><b>{p.vendidos}</b> de {p.unidades} vendidos</p>
                </div>
                <div className="bo-barra" role="img" aria-label={partes.map((x) => `${x.t}: ${x.n}`).join(", ")}>
                  {partes.filter((x) => x.n > 0).map((x) => (
                    <i key={x.c} className={x.c} style={{ flex: x.n }} />
                  ))}
                </div>
                <div className="bo-leyenda">
                  {partes.map((x) => (
                    <span key={x.c}><i className={x.c} />{x.t} <b>{x.n}</b></span>
                  ))}
                </div>
              </div>
              <div className="bo-mes">
                <p className="bo-k">En {nombreMes}</p>
                <div className="bo-mes-fila">Cobrado <b><Money valor={p.cobradoMes} /></b></div>
                <div className="bo-mes-fila">Por cobrar <b><Money valor={p.porCobrarMes} /></b></div>
                <div className="bo-mes-fila">Con vencidas <b className={p.conVencidas ? "alerta" : ""}>{p.conVencidas}</b></div>
                <div className="bo-mes-fila">Rechazados <b className={p.fallidosMes ? "alerta" : ""}>{p.fallidosMes}</b></div>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
