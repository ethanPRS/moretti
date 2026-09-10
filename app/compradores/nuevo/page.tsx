import { prisma } from "@/lib/prisma";
import RegistrarCompradorForm from "./RegistrarCompradorForm";

export default async function NuevoCompradorPage({
  searchParams,
}: {
  searchParams: Promise<{ unidadId?: string }>;
}) {
  const { unidadId } = await searchParams;

  const [unidad, paquetes] = await Promise.all([
    unidadId
      ? prisma.unidad.findUnique({
          where: { id: unidadId },
          include: { proyecto: true, prototipo: true, comprador: true },
        })
      : null,
    prisma.paquete.findMany({ orderBy: { nivel: "asc" } }),
  ]);

  if (!unidadId) {
    return (
      <p className="text-zinc-500">
        Entra desde el detalle de un proyecto y da clic en &ldquo;Registrar
        comprador&rdquo; sobre la unidad correspondiente.
      </p>
    );
  }

  if (!unidad) {
    return <p className="text-red-600">Unidad no encontrada.</p>;
  }

  if (unidad.comprador) {
    return (
      <p className="text-zinc-600">
        Esta unidad ya tiene un comprador registrado: {unidad.comprador.nombre}.
      </p>
    );
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold">Registrar comprador</h1>
      <p className="mt-1 text-sm text-zinc-600">
        {unidad.proyecto.nombre} · Torre {unidad.torre} / {unidad.numero} ·{" "}
        {unidad.prototipo.clave}
      </p>
      <p className="mt-1 text-xs text-zinc-400">
        Al registrar al comprador y elegir un paquete, el sistema genera de
        inmediato el plan: anticipo + doce mensualidades con el precio
        vigente congelado.
      </p>

      <RegistrarCompradorForm unidadId={unidad.id} paquetes={paquetes.map((p) => ({ id: p.id, nombre: p.nombre }))} />
    </div>
  );
}
