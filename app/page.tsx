import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EstadoExhibicion, EstadoPlan } from "@prisma/client";
import { PageHead, Money, ChipEstadoFinanciero } from "@/components/ui";

export default async function PanelPage() {
  const [planes, unidadesLibres, pagos] = await Promise.all([
    prisma.plan.findMany({
      where: { estado: { not: EstadoPlan.CANCELADO } },
      include: {
        comprador: { include: { unidad: { include: { proyecto: true } } } },
        paquete: true,
        exhibiciones: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.unidad.count({ where: { comprador: null } }),
    prisma.pago.findMany(),
  ]);

  const cobrado = pagos.reduce((acc, p) => acc + Number(p.monto), 0);
  const comision = pagos.reduce((acc, p) => acc + Number(p.montoComision), 0);
  const porCobrar = planes
    .filter((p) => p.estado === EstadoPlan.ACTIVO)
    .reduce((acc, p) => acc + Number(p.saldo), 0);
  const cotizaciones = planes.filter((p) => p.estado === EstadoPlan.COTIZADO).length;

  return (
    <div className="flex flex-col gap-10">
      <PageHead
        eyebrow="día uno · control"
        titulo="La cartera completa"
        descripcion="Quién ya firmó, quién ya pagó y cuánta comisión se ha devengado. Todo contra el ambiente de pruebas."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="kpi">
          <p className="k">Planes vivos</p>
          <p className="v">{planes.length}</p>
        </div>
        <div className="kpi">
          <p className="k">Cobrado</p>
          <p className="v">
            <Money valor={cobrado} />
          </p>
        </div>
        <div className="kpi">
          <p className="k">Por cobrar</p>
          <p className="v">
            <Money valor={porCobrar} />
          </p>
        </div>
        <div className="kpi">
          <p className="k">Comisión devengada</p>
          <p className="v">
            <Money valor={comision} />
          </p>
        </div>
      </div>

      {planes.length === 0 ? (
        <div className="card flex flex-col items-start gap-4 p-8">
          <div>
            <h2 className="text-[22px]">Todavía no hay ningún plan</h2>
            <p className="mt-2 max-w-[52ch] text-ink-2">
              Hay {unidadesLibres} unidades sin comprador. Entra a un proyecto, elige una unidad
              libre y registra a su comprador para generar la primera cotización.
            </p>
          </div>
          <Link href="/proyectos" className="btn">
            Ver proyectos
          </Link>
        </div>
      ) : (
        <div className="card overflow-x-auto p-5">
          <table className="tbl">
            <thead>
              <tr>
                <th>Comprador</th>
                <th>Unidad</th>
                <th>Paquete</th>
                <th className="r">Cobrado</th>
                <th className="r">Saldo</th>
                <th className="r">Estado</th>
              </tr>
            </thead>
            <tbody>
              {planes.map((plan) => {
                const pagadas = plan.exhibiciones.filter(
                  (e) => e.estado === EstadoExhibicion.PAGADA
                );
                const cobradoPlan = pagadas.reduce((acc, e) => acc + Number(e.monto), 0);
                const unidad = plan.comprador.unidad;
                return (
                  <tr key={plan.id}>
                    <td>
                      <Link href={`/planes/${plan.id}`} className="hover:text-accent">
                        {plan.comprador.nombre}
                      </Link>
                      <span className="ml-2 font-mono text-[11px] text-muted">
                        {plan.comprador.folio}
                      </span>
                    </td>
                    <td>
                      {unidad.torre} {unidad.numero}
                      <span className="block text-[12px] text-muted">{unidad.proyecto.nombre}</span>
                    </td>
                    <td>{plan.paquete.nombre}</td>
                    <td className="r">
                      <Money valor={cobradoPlan} />
                    </td>
                    <td className="r">
                      <Money valor={Number(plan.saldo)} />
                    </td>
                    <td className="r">
                      <ChipEstadoFinanciero estado={unidad.estadoFinanciero} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {cotizaciones > 0 && (
        <p className="note">
          <b>
            {cotizaciones} {cotizaciones === 1 ? "plan sigue" : "planes siguen"} en cotización.
          </b>{" "}
          El precio no queda congelado hasta que se cobra el anticipo, y el anticipo no se puede
          cobrar sin contrato firmado.
        </p>
      )}
    </div>
  );
}
