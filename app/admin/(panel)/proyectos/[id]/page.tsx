import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHead, Money, ChipEstadoFinanciero } from "@/components/ui";
import FormulariosProyecto from "./FormulariosProyecto";

export default async function ProyectoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [proyecto, paquetes] = await Promise.all([
    prisma.proyecto.findUnique({
      where: { id },
      include: {
        desarrollador: true,
        prototipos: {
          include: {
            precios: {
              where: { vigenteHasta: null },
              include: { paquete: true },
              orderBy: { paquete: { nivel: "asc" } },
            },
          },
          orderBy: { clave: "asc" },
        },
        unidades: {
          include: {
            prototipo: true,
            contrato: true,
            comprador: { include: { planes: { orderBy: { createdAt: "desc" }, take: 1 } } },
          },
          orderBy: [{ torre: "asc" }, { numero: "asc" }],
        },
      },
    }),
    prisma.paquete.findMany({ orderBy: { nivel: "asc" } }),
  ]);

  if (!proyecto) notFound();

  const vendidas = proyecto.unidades.filter((u) => u.comprador).length;
  const conPrecio = proyecto.prototipos.filter((p) => p.precios.length > 0).length;

  const unidadesTabla = (
        <div className="card overflow-x-auto p-5">
          <table className="tbl">
            <thead>
              <tr>
                <th>Unidad</th>
                <th>Prototipo</th>
                <th>Comprador</th>
                <th>Contrato</th>
                <th className="r">Estado</th>
                <th className="r" />
              </tr>
            </thead>
            <tbody>
              {proyecto.unidades.map((u) => {
                const plan = u.comprador?.planes[0];
                return (
                  <tr key={u.id}>
                    <td className="font-medium">
                      {u.torre} {u.numero}
                    </td>
                    <td className="text-ink-2">{u.prototipo.clave}</td>
                    <td>
                      {u.comprador ? (
                        <>
                          {u.comprador.nombre}
                          <span className="ml-2 font-mono text-[11px] text-muted">
                            {u.comprador.folio}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted">Libre</span>
                      )}
                    </td>
                    <td>
                      {u.contrato ? (
                        <span className="chip ok">Firmado</span>
                      ) : u.comprador ? (
                        <span className="chip late">Falta</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="r">
                      {u.comprador ? (
                        <ChipEstadoFinanciero estado={u.estadoFinanciero} />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="r">
                      {plan ? (
                        <Link href={`/admin/planes/${plan.id}`} className="text-accent hover:underline">
                          Estado de cuenta
                        </Link>
                      ) : u.comprador ? null : (
                        <Link
                          href={`/admin/unidades/${u.id}/alta`}
                          className="text-accent hover:underline"
                        >
                          Dar de alta
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
  );

  const preciosTabla = (
        <div className="card overflow-x-auto p-5">
          <table className="tbl">
            <thead>
              <tr>
                <th>Prototipo</th>
                <th className="r">m²</th>
                <th className="r">Rec.</th>
                {paquetes.map((p) => (
                  <th key={p.id} className="r">
                    {p.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {proyecto.prototipos.map((proto) => (
                <tr key={proto.id}>
                  <td className="font-medium">{proto.clave}</td>
                  <td className="r text-ink-2">{Number(proto.superficie)}</td>
                  <td className="r text-ink-2">{proto.recamaras}</td>
                  {paquetes.map((paq) => {
                    const precio = proto.precios.find((pr) => pr.paqueteId === paq.id);
                    return (
                      <td key={paq.id} className="r">
                        {precio ? <Money valor={Number(precio.monto)} /> : <span className="text-muted">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
  );

  return (
    <div className="flex flex-col gap-10">
      <div className="grid items-end gap-8 lg:grid-cols-[1fr_380px]">
        <PageHead
          eyebrow={proyecto.desarrollador.nombre}
          titulo={proyecto.nombre}
          descripcion={`${proyecto.etapaPipeline} · entrega estimada ${proyecto.fechaEntregaUnidades?.toLocaleDateString("es-MX", { month: "long", year: "numeric" }) ?? "por definir"}`}
        />
        {proyecto.imagen && (
          <div className="relative hidden aspect-[16/10] overflow-hidden rounded-[18px] bg-surface-2 lg:block">
            <Image src={proyecto.imagen} alt="" fill sizes="380px" className="object-cover" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="panel-kpi" data-destacado="">
          <p className="k">Unidades apartadas</p>
          <p className="v">{vendidas} / {proyecto.unidades.length}</p>
        </div>
        <div className="panel-kpi">
          <p className="k">Prototipos con precio</p>
          <p className="v">{conPrecio} / {proyecto.prototipos.length}</p>
        </div>
        <div className="panel-kpi">
          <p className="k">Anticipo</p>
          <p className="v">{(Number(proyecto.porcentajeAnticipo) * 100).toFixed(0)}%</p>
        </div>
        <div className="panel-kpi">
          <p className="k">Comisión día uno</p>
          <p className="v">{(Number(proyecto.porcentajeComision) * 100).toFixed(0)}%</p>
        </div>
      </div>

      <FormulariosProyecto
        proyectoId={proyecto.id}
        prototipos={proyecto.prototipos.map((p) => ({ id: p.id, clave: p.clave }))}
        paquetes={paquetes.map((p) => ({ id: p.id, nombre: p.nombre }))}
        cuentas={{ prototipos: proyecto.prototipos.length, unidades: proyecto.unidades.length, conPrecio }}
        tablas={{ unidades: unidadesTabla, precios: preciosTabla }}
        datos={{
          nombre: proyecto.nombre,
          numeroUnidades: proyecto.numeroUnidades,
          porcentajeAnticipo: Math.round(Number(proyecto.porcentajeAnticipo) * 10000) / 100,
          porcentajeComision: Math.round(Number(proyecto.porcentajeComision) * 10000) / 100,
          minimoPlan: Number(proyecto.minimoPlan),
          fechaEntregaUnidades: proyecto.fechaEntregaUnidades?.toISOString().slice(0, 10) ?? null,
          imagen: proyecto.imagen,
          stripeConnectedAccountId: proyecto.stripeConnectedAccountId,
        }}
      />
    </div>
  );
}
