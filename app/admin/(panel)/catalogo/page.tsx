import Image from "next/image";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { PageHead } from "@/components/ui";
import EditarPaquete from "./EditarPaquete";

export default async function PaquetesPage() {
  // En cada visita, no al compilar: lee la base.
  await connection();
  const paquetes = await prisma.paquete.findMany({
    orderBy: { nivel: "asc" },
    include: { precios: { where: { vigenteHasta: null } } },
  });

  return (
    <div className="flex flex-col gap-9">
      <PageHead
        eyebrow="Los paquetes"
        titulo="Paquetes"
        descripcion="Aquí se edita lo que se ve de cada paquete en el sitio: nombre, descripción, lo que incluye e imagen. Los precios se capturan por prototipo en la ficha de cada proyecto."
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {paquetes.map((p, i) => {
          const montos = p.precios.map((pr) => Number(pr.monto));
          const desde = montos.length ? Math.min(...montos) : null;
          const anteriores = paquetes.slice(0, i).flatMap((prev) => prev.partidas);

          return (
            <article key={p.id} className="card flex flex-col overflow-hidden">
              {p.imagen && (
                <div className="relative aspect-[4/3] bg-surface-2">
                  <Image
                    src={p.imagen}
                    alt={`Interior con el paquete ${p.nombre}`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover"
                  />
                </div>
              )}

              <div className="flex flex-1 flex-col gap-3 p-5">
                <div>
                  <p className="eyebrow">Paquete 0{p.nivel}</p>
                  <h2 className="mt-1.5 text-[23px]">{p.nombre}</h2>
                  <p className="mt-1 text-[13.5px] text-muted">{p.descripcion}</p>
                </div>

                <ul className="flex flex-col gap-1.5 border-t border-line pt-3.5 text-[14px]">
                  {anteriores.map((partida) => (
                    <li key={partida} className="relative pl-4 text-muted">
                      <span className="absolute left-0 text-line-2">·</span>
                      {partida}
                    </li>
                  ))}
                  {p.partidas.map((partida) => (
                    <li key={partida} className="relative pl-4 font-semibold text-ink">
                      <span className="absolute left-0 font-bold text-accent">+</span>
                      {partida}
                    </li>
                  ))}
                </ul>

                {desde !== null && (
                  <p className="pt-3 text-[13px] text-muted">
                    Desde{" "}
                    <span className="figure text-[17px] text-ink">
                      ${desde.toLocaleString("es-MX")}
                    </span>
                  </p>
                )}
                <div className="mt-auto pt-2">
                  <EditarPaquete
                    paquete={{
                      id: p.id,
                      nombre: p.nombre,
                      descripcion: p.descripcion,
                      partidas: p.partidas,
                      imagen: p.imagen,
                      esArmable: p.esArmable,
                    }}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
