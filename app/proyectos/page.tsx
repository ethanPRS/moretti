import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHead } from "@/components/ui";

export default async function ProyectosPage() {
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
          <Link href="/proyectos/nuevo" className="btn">
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
              href={`/proyectos/${p.id}`}
              className="card flex flex-col gap-4 p-6 transition-colors hover:border-line-2"
            >
              <div>
                <p className="label">{p.desarrollador.nombre}</p>
                <h2 className="mt-1 text-[24px]">{p.nombre}</h2>
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
            </Link>
          );
        })}
      </div>
    </div>
  );
}
