import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHead } from "@/components/ui";
import AltaForm from "./AltaForm";

export default async function AltaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const unidad = await prisma.unidad.findUnique({
    where: { id },
    include: {
      proyecto: true,
      prototipo: {
        include: {
          precios: {
            where: { vigenteHasta: null },
            include: { paquete: true },
            orderBy: { paquete: { nivel: "asc" } },
          },
        },
      },
      comprador: true,
    },
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

  const opciones = unidad.prototipo.precios.map((pr) => ({
    paqueteId: pr.paqueteId,
    nombre: pr.paquete.nombre,
    nivel: pr.paquete.nivel,
    monto: Number(pr.monto),
    imagen: pr.paquete.imagen,
    descripcion: pr.paquete.descripcion,
  }));

  return (
    <div className="flex flex-col gap-9">
      <PageHead
        eyebrow="Alta"
        titulo={`${unidad.torre} ${unidad.numero}`}
        descripcion={`${unidad.proyecto.nombre} · ${unidad.prototipo.clave} · ${Number(unidad.prototipo.superficie)} m² · ${unidad.prototipo.recamaras} ${unidad.prototipo.recamaras === 1 ? "recámara" : "recámaras"}`}
      />

      {opciones.length === 0 ? (
        <p className="note blocked">
          <b>Esta unidad no se puede dar de alta todavía.</b> Su prototipo no tiene precios
          cargados. Agrégalos desde el proyecto y vuelve.
        </p>
      ) : (
        <AltaForm
          unidadId={unidad.id}
          opciones={opciones}
          porcentajeAnticipo={Number(unidad.proyecto.porcentajeAnticipo)}
        />
      )}
    </div>
  );
}
