import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { PageHead, Money } from "@/components/ui";
import { Estado, IconoAviso } from "@/components/admin/Bo";
import { retenidoPorProyecto } from "@/lib/motor/transferencias";
import AutorizarForm from "./AutorizarForm";

const ESTADO = { EN_PROCESO: ["warn", "En proceso"], ENVIADA: ["ok", "Enviada"], FALLIDA: ["late", "Fallida"] } as const;

/**
 * D-34: lo que la plataforma tiene retenido de cada proyecto y las
 * transferencias a Moretti. Ana Cris decide cuándo pagar. Cada proyecto se
 * lee como una cuenta: cobrado − comisión = a transferir (D-47).
 */
export default async function TransferenciasPage() {
  await connection();
  const [retenido, historial] = await Promise.all([
    retenidoPorProyecto(),
    prisma.transferenciaMoretti.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const nombre = new Map(retenido.map((r) => [r.proyectoId, r.proyecto]));

  const total = (k: "bruto" | "comision" | "neto" | "pagos") => retenido.reduce((a, r) => a + r[k], 0);
  const sinCuenta = retenido.filter((r) => r.pagos > 0 && !r.cuentaConfigurada);
  const enviado = historial.filter((t) => t.estado === "ENVIADA").reduce((a, t) => a + Number(t.neto), 0);

  return (
    <div className="flex flex-col gap-8">
      <PageHead
        eyebrow="Pagos a Moretti"
        titulo="Lo retenido y lo transferido."
        descripcion="La plataforma cobra y retiene. Moretti recibe lo cobrado menos la comisión del canal cuando lo autorizas aquí."
      />

      <div className="bo-hero">
        <div className="bo-principal">
          <p className="bo-k">Listo para transferir</p>
          <p className="bo-v"><Money valor={total("neto")} conCentavos /></p>
          <p className="bo-nota">{total("pagos")} cobros retenidos</p>
        </div>
        <div>
          <p className="bo-k">Cobrado</p>
          <p className="bo-v"><Money valor={total("bruto")} /></p>
          <p className="bo-nota">Retenido hoy</p>
        </div>
        <div>
          <p className="bo-k">Comisión del canal</p>
          <p className="bo-v"><Money valor={total("comision")} /></p>
          <p className="bo-nota">Se queda en la plataforma</p>
        </div>
        <div>
          <p className="bo-k">Ya transferido</p>
          <p className="bo-v"><Money valor={enviado} /></p>
          <p className="bo-nota">{historial.length} {historial.length === 1 ? "transferencia" : "transferencias"}</p>
        </div>
      </div>

      {sinCuenta.length > 0 && (
        <Estado tipo="aviso" titulo="Falta conectar la cuenta de Stripe de Moretti">
          Sin ella no se puede transferir lo de {sinCuenta.map((r) => r.proyecto).join(" y ")}. Se configura en el proyecto.
        </Estado>
      )}

      <section className="bo-seccion">
        <div className="bo-seccion-t">
          <h2>Por proyecto</h2>
          <span>Lo que la plataforma tiene de cada uno.</span>
        </div>
        {retenido.map((r) => (
          <div key={r.proyectoId} className="bo-card bo-mor">
            <div>
              <div className="bo-mor-cab">
                <h3>{r.proyecto}</h3>
                <span>{r.pagos} {r.pagos === 1 ? "cobro" : "cobros"}</span>
              </div>
              <div className="bo-cuenta">
                <div><p className="bo-k">Cobrado</p><p className="bo-v"><Money valor={r.bruto} conCentavos /></p></div>
                <span className="op" aria-hidden="true">−</span>
                <div><p className="bo-k">Comisión</p><p className="bo-v text-muted"><Money valor={r.comision} conCentavos /></p></div>
                <span className="op" aria-hidden="true">=</span>
                <div className="total"><p className="bo-k">A transferir</p><p className="bo-v"><Money valor={r.neto} conCentavos /></p></div>
              </div>
            </div>
            {r.pagos === 0 ? (
              <p className="bo-nada">Nada retenido por ahora.</p>
            ) : !r.cuentaConfigurada ? (
              <p className="bo-falta"><IconoAviso />Falta la cuenta de Stripe de Moretti para este proyecto.</p>
            ) : (
              <AutorizarForm proyectoId={r.proyectoId} neto={`$${r.neto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`} />
            )}
          </div>
        ))}
      </section>

      <section className="bo-seccion">
        <div className="bo-seccion-t">
          <h2>Transferencias</h2>
          <span>Las últimas 50.</span>
        </div>
        {historial.length === 0 ? (
          <p className="note">Todavía no se ha transferido nada a Moretti.</p>
        ) : (
          <ol className="bo-lista bo-hist">
            {historial.map((t) => (
              <li key={t.id}>
                <span className={`bo-hist-punto ${ESTADO[t.estado][0]}`} aria-hidden="true" />
                <div className="bo-quien">
                  <b>{nombre.get(t.proyectoId) ?? "—"} · <Money valor={Number(t.neto)} conCentavos /></b>
                  <span>
                    {t.createdAt.toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · autorizó {t.autorizadaPor}
                    {(t.referencia ?? t.error) && <> · <span className="font-mono text-[11px]">{t.referencia ?? t.error}</span></>}
                  </span>
                </div>
                <span className={`chip ${ESTADO[t.estado][0]}`}>{ESTADO[t.estado][1]}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
