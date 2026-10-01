import Image from "next/image";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { PageHead, Money } from "@/components/ui";
import EditarPaquete from "./EditarPaquete";

export default async function PaquetesPage() {
  // En cada visita, no al compilar: lee la base.
  await connection();
  const paquetes = await prisma.paquete.findMany({
    orderBy: { nivel: "asc" },
    include: { precios: { where: { vigenteHasta: null } } },
  });

  return (
    <div className="flex flex-col gap-10">
      <PageHead
        eyebrow="Paquetes"
        titulo="Lo que se vende, nivel por nivel."
        descripcion="Aquí se edita cómo se ve cada paquete en el sitio: nombre, descripción, lo que incluye e imagen. Los precios se capturan por prototipo en la ficha de cada proyecto."
      />

      <ol className="flex flex-col gap-4">
        {paquetes.map((p, i) => {
          const montos = p.precios.map((pr) => Number(pr.monto));
          const desde = montos.length ? Math.min(...montos) : null;
          const hasta = montos.length ? Math.max(...montos) : null;
          const anterior = i > 0 && !p.esArmable ? paquetes[i - 1] : null;

          return (
            <li key={p.id} className="pq">
              <div className="pq-foto">
                {p.imagen ? (
                  <Image src={p.imagen} alt={`Interior con el paquete ${p.nombre}`} fill sizes="(max-width: 768px) 100vw, 240px" className="object-cover" />
                ) : (
                  <span className="grid h-full place-items-center text-[13px] text-muted">Sin imagen</span>
                )}
              </div>

              <div className="flex min-w-0 flex-col gap-3">
                <div>
                  <p className="pq-nivel" data-armable={p.esArmable ? "" : undefined}>
                    Paquete 0{p.nivel}{p.esArmable ? " · a tu medida" : ""}
                  </p>
                  <h2 className="mt-1 text-[26px] leading-tight">{p.nombre}</h2>
                  {p.descripcion && <p className="mt-1 text-[14.5px] text-ink-2">{p.descripcion}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {anterior && <span className="pq-chip pq-chip-suave">Todo {anterior.nombre}</span>}
                  {p.partidas.map((partida) => (
                    <span key={partida} className="pq-chip">
                      {p.esArmable ? "" : "+ "}
                      {partida}
                    </span>
                  ))}
                </div>
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

              <div className="pq-precio">
                {p.esArmable ? (
                  <>
                    <p className="pq-k">Precio</p>
                    <p className="text-[15px] text-ink-2">A lista, pieza por pieza</p>
                  </>
                ) : desde !== null ? (
                  <>
                    <p className="pq-k">Desde</p>
                    <p className="pq-v"><Money valor={desde} /></p>
                    {hasta !== desde && (
                      <p className="text-[13px] text-muted">hasta <Money valor={hasta!} /></p>
                    )}
                    <p className="mt-2 text-[12.5px] text-muted">
                      En {montos.length} {montos.length === 1 ? "prototipo" : "prototipos"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="pq-k">Sin precio</p>
                    <p className="text-[13px] text-muted">Captúralo en la ficha de un proyecto.</p>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
