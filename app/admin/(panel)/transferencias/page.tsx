import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { PageHead, Money } from "@/components/ui";
import { retenidoPorProyecto } from "@/lib/motor/transferencias";
import AutorizarForm from "./AutorizarForm";

const ESTADO = { EN_PROCESO: ["warn", "En proceso"], ENVIADA: ["ok", "Enviada"], FALLIDA: ["late", "Fallida"] } as const;

/**
 * D-34: lo que la plataforma tiene retenido de cada proyecto y las
 * transferencias a Moretti. Ana Cris decide cuándo pagar.
 */
export default async function TransferenciasPage() {
  await connection();
  const [retenido, historial] = await Promise.all([
    retenidoPorProyecto(),
    prisma.transferenciaMoretti.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const nombre = new Map(retenido.map((r) => [r.proyectoId, r.proyecto]));

  return (
    <div className="flex flex-col gap-9">
      <PageHead
        eyebrow="Pagos a Moretti"
        titulo="Lo retenido y lo transferido."
        descripcion="La plataforma cobra y retiene. Moretti recibe lo cobrado menos la comisión del canal cuando se autoriza aquí."
      />

      <div className="card overflow-x-auto p-5">
        <table className="tbl">
          <thead>
            <tr>
              <th>Proyecto</th>
              <th className="r">Cobros</th>
              <th className="r">Cobrado</th>
              <th className="r">Comisión</th>
              <th className="r">A transferir</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {retenido.map((r) => (
              <tr key={r.proyectoId}>
                <td className="font-medium">{r.proyecto}</td>
                <td className="r">{r.pagos}</td>
                <td className="r"><Money valor={r.bruto} conCentavos /></td>
                <td className="r text-muted"><Money valor={r.comision} conCentavos /></td>
                <td className="r font-semibold"><Money valor={r.neto} conCentavos /></td>
                <td>
                  {r.pagos === 0 ? (
                    <span className="text-[12.5px] text-muted">Nada retenido</span>
                  ) : !r.cuentaConfigurada ? (
                    <span className="text-[12.5px] text-warm">Falta la cuenta de Stripe de Moretti</span>
                  ) : (
                    <AutorizarForm proyectoId={r.proyectoId} neto={`$${r.neto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="flex flex-col gap-3">
        <p className="label">Transferencias</p>
        {historial.length === 0 ? (
          <p className="note">Todavía no se ha transferido nada a Moretti.</p>
        ) : (
          <div className="card overflow-x-auto p-5">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Proyecto</th>
                  <th>Autorizó</th>
                  <th className="r">Monto</th>
                  <th>Estado</th>
                  <th>Referencia</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((t) => (
                  <tr key={t.id}>
                    <td>{t.createdAt.toLocaleString("es-MX")}</td>
                    <td>{nombre.get(t.proyectoId) ?? "—"}</td>
                    <td>{t.autorizadaPor}</td>
                    <td className="r"><Money valor={Number(t.neto)} conCentavos /></td>
                    <td><span className={`chip ${ESTADO[t.estado][0]}`}>{ESTADO[t.estado][1]}</span></td>
                    <td className="font-mono text-[11px] text-muted">{t.referencia ?? t.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
