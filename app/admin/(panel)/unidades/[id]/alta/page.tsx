import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { cargarCatalogo } from "@/lib/motor/catalogo";
import { PageHead } from "@/components/ui";
import AltaForm, { type VistaPaquete } from "./AltaForm";

export default async function AltaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const unidad = await prisma.unidad.findUnique({
    where: { id },
    include: { proyecto: true, prototipo: true, comprador: true },
  });
  if (!unidad) notFound();

  if (unidad.comprador) {
    return (
      <div className="flex flex-col gap-5">
        <PageHead
          eyebrow="Alta"
          titulo={`${unidad.torre} ${unidad.numero}`}
          descripcion={`Esta unidad ya está dada de alta a nombre de ${unidad.comprador.nombre}.`}
        />
        <Link href={`/admin/proyectos/${unidad.proyectoId}`} className="btn self-start">
          Volver al proyecto
        </Link>
      </div>
    );
  }

  // El mismo catálogo con el que cotiza el sitio y con el que el motor
  // genera el plan (S1-04).
  const [catalogo, paquetes] = await Promise.all([
    cargarCatalogo(unidad.prototipoId),
    prisma.paquete.findMany({ select: { id: true, imagen: true, descripcion: true } }),
  ]);
  const vistas: Record<string, VistaPaquete> = Object.fromEntries(
    paquetes.map((p) => [p.id, { imagen: p.imagen, descripcion: p.descripcion }])
  );

  return (
    <div className="flex flex-col gap-9">
      <PageHead
        eyebrow="Alta"
        titulo={`${unidad.torre} ${unidad.numero}`}
        descripcion={`${unidad.proyecto.nombre} · ${unidad.prototipo.clave} · ${Number(unidad.prototipo.superficie)} m² · ${unidad.prototipo.recamaras} ${unidad.prototipo.recamaras === 1 ? "recámara" : "recámaras"}`}
      />

      {catalogo.prototipo.paquetes.length === 0 && !catalogo.armable ? (
        <p className="note blocked">
          <b>Esta unidad no se puede dar de alta todavía.</b> Su prototipo no tiene precios
          cargados. Agrégalos desde el proyecto y vuelve.
        </p>
      ) : (
        <AltaForm
          unidadId={unidad.id}
          proyecto={catalogo.proyecto}
          prototipo={catalogo.prototipo}
          armable={catalogo.armable}
          vistas={vistas}
        />
      )}
    </div>
  );
}
