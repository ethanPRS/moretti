import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function ProyectosPage() {
  const proyectos = await prisma.proyecto.findMany({
    include: { desarrollador: true, unidades: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Proyectos</h1>
        <Link
          href="/proyectos/nuevo"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          + Nuevo proyecto
        </Link>
      </div>

      {proyectos.length === 0 ? (
        <p className="text-zinc-500">
          Todavía no hay proyectos. Crea el primero para empezar.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {proyectos.map((p) => (
            <Link
              key={p.id}
              href={`/proyectos/${p.id}`}
              className="rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-400"
            >
              <div className="font-medium">{p.nombre}</div>
              <div className="text-sm text-zinc-500">{p.desarrollador.nombre}</div>
              <div className="mt-2 flex gap-4 text-xs text-zinc-500">
                <span>{p.etapaPipeline}</span>
                <span>{p.unidades.length} unidades</span>
                <span>{Number(p.porcentajeAnticipo) * 100}% anticipo</span>
                <span>{Number(p.porcentajeComision) * 100}% comisión</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
