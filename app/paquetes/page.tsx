import { prisma } from "@/lib/prisma";
import { PageHead } from "@/components/ui";

export default async function PaquetesPage() {
  const paquetes = await prisma.paquete.findMany({
    orderBy: { nivel: "asc" },
    include: { precios: { where: { vigenteHasta: null } } },
  });

  return (
    <div className="flex flex-col gap-9">
      <PageHead
        eyebrow="Catálogo"
        titulo="Cuatro paquetes acumulativos"
        descripcion="Cada nivel incluye todo el anterior. El precio cambia por prototipo, porque cambian los metros lineales de cocina y clósets y el número de climas."
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {paquetes.map((p) => {
          const montos = p.precios.map((pr) => Number(pr.monto));
          const desde = montos.length ? Math.min(...montos) : null;
          return (
            <div key={p.id} className="card flex flex-col gap-4 p-6">
              <div>
                <p className="eyebrow">Nivel {p.nivel}</p>
                <h2 className="mt-1.5 text-[24px]">{p.nombre}</h2>
              </div>
              <ul className="flex flex-col gap-1.5 border-t border-line pt-4 text-[14px] text-ink-2">
                {p.partidas.map((partida) => (
                  <li key={partida} className="relative pl-4">
                    <span className="absolute left-0 font-bold text-accent">+</span>
                    {partida}
                  </li>
                ))}
              </ul>
              {desde !== null && (
                <p className="mt-auto pt-2 text-[13px] text-muted">
                  Desde{" "}
                  <span className="figure text-[16px] text-ink">
                    ${desde.toLocaleString("es-MX")}
                  </span>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
