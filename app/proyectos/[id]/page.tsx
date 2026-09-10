import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import NuevoPrototipoForm from "./NuevoPrototipoForm";
import NuevoPrecioForm from "./NuevoPrecioForm";
import NuevaUnidadForm from "./NuevaUnidadForm";

export default async function ProyectoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [proyecto, paquetes] = await Promise.all([
    prisma.proyecto.findUnique({
      where: { id },
      include: {
        desarrollador: true,
        prototipos: {
          include: { precios: { include: { paquete: true }, orderBy: { vigenteDesde: "desc" } } },
        },
        unidades: {
          include: { prototipo: true, comprador: { include: { planes: true } } },
          orderBy: [{ torre: "asc" }, { numero: "asc" }],
        },
      },
    }),
    prisma.paquete.findMany({ orderBy: { nivel: "asc" } }),
  ]);

  if (!proyecto) notFound();

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold">{proyecto.nombre}</h1>
        <p className="text-sm text-zinc-500">
          {proyecto.desarrollador.nombre} · {proyecto.etapaPipeline} ·{" "}
          {Number(proyecto.porcentajeAnticipo) * 100}% anticipo ·{" "}
          {Number(proyecto.porcentajeComision) * 100}% comisión
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Prototipos y precios</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {proyecto.prototipos.map((proto) => {
            const vigentes = proto.precios.filter((pr) => !pr.vigenteHasta);
            return (
              <div key={proto.id} className="rounded-lg border border-zinc-200 bg-white p-4">
                <div className="font-medium">
                  {proto.clave} · {Number(proto.superficie)} m² · {proto.recamaras} rec.
                </div>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-600">
                  {vigentes.length === 0 && <li className="text-zinc-400">Sin precios cargados</li>}
                  {vigentes.map((pr) => (
                    <li key={pr.id}>
                      {pr.paquete.nombre}: ${Number(pr.monto).toLocaleString("es-MX")}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <NuevoPrototipoForm proyectoId={proyecto.id} />
          <NuevoPrecioForm
            prototipos={proyecto.prototipos.map((p) => ({ id: p.id, clave: p.clave }))}
            paquetes={paquetes.map((p) => ({ id: p.id, nombre: p.nombre }))}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Unidades</h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2">Torre / Número</th>
                <th className="px-4 py-2">Prototipo</th>
                <th className="px-4 py-2">Comprador</th>
                <th className="px-4 py-2">Plan</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {proyecto.unidades.map((u) => (
                <tr key={u.id} className="border-t border-zinc-100">
                  <td className="px-4 py-2">
                    {u.torre} / {u.numero}
                  </td>
                  <td className="px-4 py-2">{u.prototipo.clave}</td>
                  <td className="px-4 py-2">{u.comprador?.nombre ?? "—"}</td>
                  <td className="px-4 py-2">
                    {u.comprador?.planes[0] ? (
                      <Link
                        href={`/planes/${u.comprador.planes[0].id}`}
                        className="text-zinc-900 underline"
                      >
                        Ver estado de cuenta
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!u.comprador && (
                      <Link
                        href={`/compradores/nuevo?unidadId=${u.id}`}
                        className="text-sm font-medium text-zinc-900 underline"
                      >
                        Registrar comprador
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
              {proyecto.unidades.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-zinc-400">
                    Sin unidades todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <NuevaUnidadForm
          proyectoId={proyecto.id}
          prototipos={proyecto.prototipos.map((p) => ({ id: p.id, clave: p.clave }))}
        />
      </section>
    </div>
  );
}
