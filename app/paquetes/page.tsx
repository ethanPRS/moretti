import { prisma } from "@/lib/prisma";
import NuevoPaqueteForm from "./NuevoPaqueteForm";

export default async function PaquetesPage() {
  const paquetes = await prisma.paquete.findMany({ orderBy: { nivel: "asc" } });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Paquetes</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Los cuatro paquetes acumulativos de equipamiento. Son globales; cada
          prototipo de cada proyecto tiene su propio precio por paquete.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {paquetes.map((p) => (
          <div key={p.id} className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="font-medium">
              Nivel {p.nivel} · {p.nombre}
            </div>
            <div className="mt-1 text-sm text-zinc-500">
              {p.partidas.join(", ") || "Sin partidas registradas"}
            </div>
          </div>
        ))}
      </div>

      <NuevoPaqueteForm />
    </div>
  );
}
