import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { darDeAlta, registrarContrato, ReglaError } from "@/lib/motor/planes";

/**
 * El comprador aparta desde el sitio: se da de alta con su canasta y firma el
 * contrato simulado con Moretti. El anticipo se cobra en el siguiente paso
 * (POST /api/apartar/anticipo), porque R1 pide el contrato antes del cobro.
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
    return NextResponse.json({ planId: plan.id, folio: comprador.folio }, { status: 201 });
  } catch (err) {
    if (err instanceof ReglaError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
