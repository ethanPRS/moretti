import Link from "next/link";
import Image from "next/image";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { PageHead } from "@/components/ui";

export default async function ProyectosPage() {
  // En cada visita, no al compilar: lee la base.
  await connection();
  const proyectos = await prisma.proyecto.findMany({
    include: {
      desarrollador: true,
      prototipos: true,
      unidades: { include: { comprador: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex flex-col gap-9">
      <PageHead
        eyebrow="Pipeline"
        titulo="Proyectos"
        descripcion="Cada desarrollo tiene sus propios prototipos, precios y porcentaje de comisión. Nada asume que haya un solo proyecto."
        accion={
          <Link href="/admin/proyectos/nuevo" className="btn">
            Nuevo proyecto
          </Link>
        }
      />

      <div className="grid gap-5 sm:grid-cols-2">
        {proyectos.map((p) => {
          const vendidas = p.unidades.filter((u) => u.comprador).length;
          return (
            <Link
              key={p.id}
              href={`/admin/proyectos/${p.id}`}
              className="card group flex flex-col overflow-hidden transition-colors hover:border-line-2"
            >
              {p.imagen && (
                <div className="relative aspect-[16/9] bg-surface-2">
                  <Image
                    src={p.imagen}
                    alt={`Interior tipo de ${p.nombre}`}
                    fill
                    sizes="(max-width: 640px) 100vw, 50vw"
                    className="object-cover"
                  />
                </div>
              )}

              <div className="flex flex-col gap-4 p-6">
                <div>
                  <p className="label">{p.desarrollador.nombre}</p>
                  <h2 className="mt-1 text-[24px]">{p.nombre}</h2>
                  <p className="mt-1 text-[13.5px] text-muted">
                    {p.etapaPipeline} · {p.prototipos.length} prototipos
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4 border-t border-line pt-4 text-[13px]">
                  <div>
                    <p className="label">Unidades</p>
                    <p className="figure mt-1 text-[19px]">
                      {vendidas}/{p.unidades.length}
                    </p>
                  </div>
                  <div>
                    <p className="label">Anticipo</p>
                    <p className="figure mt-1 text-[19px]">
                      {(Number(p.porcentajeAnticipo) * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <p className="label">Comisión</p>
                    <p className="figure mt-1 text-[19px]">
                      {(Number(p.porcentajeComision) * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
