import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { darDeAlta, registrarContrato, ReglaError } from "@/lib/motor/planes";

/**
 * El comprador aparta desde el sitio: se da de alta con su canasta y firma el
 * contrato simulado con Moretti. Devuelve el calendario persistido para que
 * el navegador presente los importes que calculó el motor.
 *
 * Prototipo: el contrato es una simulación y la firma es el nombre escrito.
 * Falta sesión y protección contra abuso antes de abrirlo al público (B-3).
 */
const Apartado = z.object({
  nombre: z.string().trim().min(3),
  contacto: z.string().trim().min(5),
  unidadId: z.string().min(1),
  paqueteId: z.string().min(1),
  canasta: z.record(z.string(), z.number().int().min(0)).optional(),
  firma: z.string().trim().min(3),
  acepta: z.literal(true),
});

const normal = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();

export async function POST(req: NextRequest) {
  const datos = Apartado.safeParse(await req.json().catch(() => null));
  if (!datos.success) {
    return NextResponse.json(
      { error: "Faltan tus datos, la firma o aceptar el contrato." },
      { status: 400 }
    );
  }
  const d = datos.data;
  if (normal(d.firma) !== normal(d.nombre)) {
    return NextResponse.json(
      { error: `Para firmar escribe tu nombre tal como lo capturaste: «${d.nombre}».` },
      { status: 400 }
    );
  }

  try {
    const { comprador, plan } = await darDeAlta({
      nombre: d.nombre,
      contacto: d.contacto,
      unidadId: d.unidadId,
      paqueteId: d.paqueteId,
      canasta: d.canasta,
    });
    await registrarContrato({
      unidadId: d.unidadId,
      archivoNombre: `contrato-simulado-${comprador.folio}.pdf`,
      quienFirmo: d.firma,
      fechaFirma: new Date(),
    });
    const detalle = await prisma.plan.findUnique({
      where: { id: plan.id },
      include: {
        paquete: true,
        comprador: { include: { unidad: { include: { proyecto: true, prototipo: true } } } },
        renglones: { include: { partida: true } },
        exhibiciones: { orderBy: { numero: "asc" } },
      },
    });
    if (!detalle) throw new Error("No se pudo recuperar el plan recién creado.");

    const unidad = detalle.comprador.unidad;
    return NextResponse.json(
      {
        planId: plan.id,
        folio: comprador.folio,
        resumen: {
          proyecto: unidad.proyecto.nombre,
          prototipo: unidad.prototipo.clave,
          torre: unidad.torre,
          unidad: unidad.numero,
          paquete: detalle.paquete.nombre,
          total: Number(detalle.montoCongelado),
          saldo: Number(detalle.saldo),
          partidas: detalle.renglones.map((r) => ({
            nombre: r.partida.nombre,
            cantidad: r.cantidad,
            importe: Number(r.precioCongelado),
          })),
          exhibiciones: detalle.exhibiciones.map((e) => ({
            id: e.id,
            numero: e.numero,
            monto: Number(e.monto),
            fechaProgramada: e.fechaProgramada.toISOString(),
            estado: e.estado,
          })),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ReglaError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
