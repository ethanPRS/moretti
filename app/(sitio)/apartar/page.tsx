import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { cargarCatalogosPorProyecto } from "@/lib/motor/catalogo";
import Apartado from "./Apartado";

export const metadata = { title: "Aparta tu paquete · día uno" };

/** `k:n,k:n` → { k: n }. Lo que no se entienda se ignora: el motor valida. */
function leerCanasta(valor: string | undefined) {
  if (!valor) return undefined;
  const canasta: Record<string, number> = {};
  for (const par of valor.split(",")) {
    const [clave, n] = par.split(":");
    const cantidad = Number(n);
    if (clave && Number.isInteger(cantidad) && cantidad >= 0) canasta[clave] = cantidad;
  }
  return canasta;
}

export default async function ApartarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await connection();
  const q = await searchParams;
  const catalogo = await cargarCatalogosPorProyecto();

  const desarrollo = catalogo.proyectos.find((p) => p.prototipos.some((x) => x.id === q.prototipo));
  const prototipo = desarrollo?.prototipos.find((x) => x.id === q.prototipo);
  const esArmable = catalogo.armable !== null && q.paquete === catalogo.armable.id;
  const cerrado = prototipo?.paquetes.find((p) => p.id === q.paquete);

  if (!desarrollo || !prototipo || (!esArmable && !cerrado)) {
    return (
      <section className="mx-auto max-w-[680px] px-7 py-24">
        <p className="eyebrow">Aparta tu paquete</p>
        <h1 className="mt-3 text-[32px]">Primero elige tu depa y tu paquete.</h1>
        <p className="mt-3 text-ink-2">
          Para apartar necesitamos saber qué departamento compraste y qué paquete quieres.
        </p>
        <Link href="/cotizar" className="btn mt-7">Ir al cotizador</Link>
      </section>
    );
  }

  const unidades = await prisma.unidad.findMany({
    where: { prototipoId: prototipo.id, comprador: null },
    select: { id: true, torre: true, numero: true },
    orderBy: [{ torre: "asc" }, { numero: "asc" }],
  });

  return (
    <Apartado
      desarrollo={{ id: desarrollo.id, nombre: desarrollo.nombre, anticipoBP: desarrollo.anticipoBP, minimoPlan: desarrollo.minimoPlan }}
      prototipo={prototipo}
      paquete={
        esArmable
          ? { id: catalogo.armable!.id, nombre: catalogo.armable!.nombre, armable: true }
          : { id: cerrado!.id, nombre: cerrado!.nombre, armable: false }
      }
      canasta={esArmable ? leerCanasta(q.canasta) : undefined}
      unidades={unidades}
    />
  );
}
