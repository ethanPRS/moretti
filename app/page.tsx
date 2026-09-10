import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const [proyectos, compradores, planes] = await Promise.all([
    prisma.proyecto.count(),
    prisma.comprador.count(),
    prisma.plan.count(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Motor financiero — prototipo</h1>
        <p className="mt-1 max-w-2xl text-zinc-600">
          Módulo A.1: contratar un paquete genera el calendario de anticipo +
          doce mensualidades con precio congelado, y un estado de cuenta
          consultable por plan.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Proyectos" value={proyectos} />
        <StatCard label="Compradores" value={compradores} />
        <StatCard label="Planes generados" value={planes} />
      </div>

      <div className="flex gap-3">
        <Link
          href="/proyectos"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Ver proyectos
        </Link>
        <Link
          href="/paquetes"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100"
        >
          Administrar paquetes
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-zinc-500">{label}</div>
    </div>
  );
}
