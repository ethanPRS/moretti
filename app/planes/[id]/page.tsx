import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EstadoExhibicion, EstadoPlan } from "@prisma/client";
import {
  PageHead,
  Money,
  Stat,
  ChipEstadoPlan,
  CintaExhibiciones,
} from "@/components/ui";
import CobrarButton from "./CobrarButton";
import ContratoForm from "./ContratoForm";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const plan = await prisma.plan.findUnique({
    where: { id },
    include: {
      comprador: {
        include: {
          unidad: { include: { proyecto: true, prototipo: true, contrato: true } },
        },
      },
      paquete: true,
      exhibiciones: { orderBy: { numero: "asc" }, include: { pago: true } },
    },
  });
  if (!plan) notFound();

  const eventos = await prisma.evento.findMany({
    where: { entidadTipo: "plan", entidadId: plan.id },
    orderBy: { fecha: "desc" },
  });

  const unidad = plan.comprador.unidad;
  const contrato = unidad.contrato;
  const pagadas = plan.exhibiciones.filter((e) => e.estado === EstadoExhibicion.PAGADA);
  const cobrado = pagadas.reduce((acc, e) => acc + Number(e.monto), 0);
  const comision = plan.exhibiciones.reduce(
    (acc, e) => acc + (e.pago ? Number(e.pago.montoComision) : 0),
    0
  );
  const congelado = Boolean(plan.fechaCongelamiento);
  const siguiente = plan.exhibiciones.find((e) => e.estado !== EstadoExhibicion.PAGADA);

  return (
    <div className="flex flex-col gap-9">
      <PageHead
        eyebrow="Estado de cuenta"
        titulo={plan.comprador.nombre}
        descripcion={`${unidad.proyecto.nombre} · ${unidad.torre} ${unidad.numero} · ${unidad.prototipo.clave} · paquete ${plan.paquete.nombre}`}
        accion={<ChipEstadoPlan estado={plan.estado} />}
      />

      <div className="card grid grid-cols-2 gap-7 p-7 sm:grid-cols-4">
        <Stat
          etiqueta={congelado ? "Precio congelado" : "Precio cotizado"}
          valor={<Money valor={Number(plan.montoCongelado)} />}
          nota={
            congelado
              ? `Congelado el ${plan.fechaCongelamiento!.toLocaleDateString("es-MX")}`
              : "Todavía puede cambiar"
          }
        />
        <Stat etiqueta="Cobrado" valor={<Money valor={cobrado} />} nota={`${pagadas.length} de 13`} />
        <Stat etiqueta="Saldo" valor={<Money valor={Number(plan.saldo)} />} />
        <Stat
          etiqueta="Comisión del canal"
          valor={<Money valor={comision} />}
          nota={`${(Number(unidad.proyecto.porcentajeComision) * 100).toFixed(0)} % por cobro`}
        />
      </div>

      <div className="flex flex-col gap-3">
        <p className="label">Avance del plan</p>
        <CintaExhibiciones exhibiciones={plan.exhibiciones} />
      </div>

      {!congelado && (
        <p className={`note ${contrato ? "" : "blocked"}`}>
          {contrato ? (
            <>
              <b>Listo para cobrar el anticipo.</b> El contrato quedó firmado por{" "}
              {contrato.quienFirmo} el {contrato.fechaFirma.toLocaleDateString("es-MX")}. Al cobrar
              el anticipo, el precio se congela y la unidad pasa a apartada.
            </>
          ) : (
            <>
              <b>No se puede cobrar todavía: falta el contrato firmado.</b> El precio sigue siendo
              una cotización y puede cambiar. Registra el contrato para poder cobrar el anticipo.
            </>
          )}
        </p>
      )}

      {!contrato && <ContratoForm unidadId={unidad.id} />}

      <div className="card overflow-x-auto p-5">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Concepto</th>
              <th>Fecha programada</th>
              <th className="r">Monto</th>
              <th className="r">Comisión</th>
              <th className="r">Estado</th>
              <th className="r" />
            </tr>
          </thead>
          <tbody>
            {plan.exhibiciones.map((ex) => (
              <tr key={ex.id}>
                <td className="text-muted">{ex.numero}</td>
                <td>{ex.numero === 0 ? "Anticipo" : `Mensualidad ${ex.numero}`}</td>
                <td>{ex.fechaProgramada.toLocaleDateString("es-MX")}</td>
                <td className="r">
                  <Money valor={Number(ex.monto)} />
                </td>
                <td className="r text-muted">
                  {ex.pago ? <Money valor={Number(ex.pago.montoComision)} conCentavos /> : "—"}
                </td>
                <td className="r">
                  {ex.estado === EstadoExhibicion.PAGADA ? (
                    <span className="chip ok">Pagada</span>
                  ) : ex.estado === EstadoExhibicion.VENCIDA ? (
                    <span className="chip late">Vencida</span>
                  ) : (
                    <span className="chip wait">Programada</span>
                  )}
                </td>
                <td className="r">
                  {siguiente?.id === ex.id && plan.estado !== EstadoPlan.LIQUIDADO && (
                    <CobrarButton
                      exhibicionId={ex.id}
                      esAnticipo={ex.numero === 0}
                      bloqueado={ex.numero === 0 && !contrato}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3">
        <p className="label">Bitácora</p>
        <div className="card divide-y divide-line">
          {eventos.map((e) => (
            <div key={e.id} className="flex gap-4 p-4 text-[13.5px]">
              <span className="shrink-0 font-mono text-[11.5px] text-muted">
                {e.fecha.toLocaleString("es-MX", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="text-ink-2">{e.comentario}</span>
            </div>
          ))}
        </div>
        <p className="text-[12.5px] text-muted">
          La bitácora no se edita ni se borra. Es lo que sostiene una aclaración con el comprador.
        </p>
      </div>
    </div>
  );
}
