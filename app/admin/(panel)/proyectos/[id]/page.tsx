import Link from "next/link";
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

  return (
    <div className="flex flex-col gap-10">
      <PageHead
        eyebrow={proyecto.desarrollador.nombre}
        titulo={proyecto.nombre}
        descripcion={`${proyecto.etapaPipeline} · anticipo ${(Number(proyecto.porcentajeAnticipo) * 100).toFixed(0)} % · comisión del canal ${(Number(proyecto.porcentajeComision) * 100).toFixed(0)} % · entrega estimada ${proyecto.fechaEntregaUnidades?.toLocaleDateString("es-MX") ?? "por definir"}`}
      />

      <section className="flex flex-col gap-4">
        <h2 className="text-[22px]">Unidades</h2>
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
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-[22px]">Prototipos y lista de precios</h2>
          <p className="mt-2 text-[14px] text-ink-2">
            Un precio nuevo no sobreescribe al anterior: cierra su vigencia y queda en el histórico.
          </p>
        </div>
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
      </section>

      <FormulariosProyecto
        proyectoId={proyecto.id}
        prototipos={proyecto.prototipos.map((p) => ({ id: p.id, clave: p.clave }))}
        paquetes={paquetes.map((p) => ({ id: p.id, nombre: p.nombre }))}
      />
    </div>
  );
}
