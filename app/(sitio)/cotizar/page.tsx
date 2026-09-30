import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { DESCUENTO_CONTADO } from "@/lib/motor/calculo";
import { cargarCatalogosPorProyecto } from "@/lib/motor/catalogo";
import Configurador from "./Configurador";
import "./cotizar.css";

export const metadata = {
  title: "Cotiza tu depa · día uno",
  description: "Elige tu desarrollo, tu departamento y tu paquete, y ve al momento cuánto apartas y cuánto pagas al mes.",
};

export default async function CotizarPage() {
  // En cada visita: los precios, el mínimo y las unidades libres viven en la base.
  await connection();
  const [catalogo, paquetes, proyectos, libres] = await Promise.all([
    cargarCatalogosPorProyecto(),
    prisma.paquete.findMany({ select: { nivel: true, imagen: true } }),
    prisma.proyecto.findMany({ select: { id: true, imagen: true } }),
    prisma.unidad.groupBy({ by: ["prototipoId"], where: { comprador: null }, _count: true }),
  ]);

  const imagenProyecto = new Map(proyectos.map((p) => [p.id, p.imagen]));
  const desarrollos = catalogo.proyectos
    .filter((p) => p.prototipos.length > 0)
    .map((p) => ({ ...p, imagen: imagenProyecto.get(p.id) ?? null }));

  return (
    <section className="cz-pagina">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <p className="cz-etiqueta">Cotiza tu depa</p>
        <h1 className="cz-titulo">Tres pasos y sabes cuánto pagas al mes.</h1>
        <p className="mt-4 max-w-[52ch] text-[17px] text-ink-2">
          Cada prototipo tiene medidas distintas, así que el precio cambia. Elige el tuyo y
          compara paquetes: el total y las mensualidades se actualizan al momento.
        </p>

        <div className="mt-12">
          <Configurador
            desarrollos={desarrollos}
            armable={catalogo.armable}
            descuentoContado={DESCUENTO_CONTADO}
            disponibles={Object.fromEntries(libres.map((l) => [l.prototipoId, l._count]))}
            imagenesPaquete={Object.fromEntries(paquetes.map((p) => [p.nivel, p.imagen]))}
          />
        </div>
      </div>
    </section>
  );
}
