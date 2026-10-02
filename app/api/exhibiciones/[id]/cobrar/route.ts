import { NextResponse } from "next/server";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  return NextResponse.json(
    { error: "Esta ruta quedó deshabilitada: un cobro debe confirmarse en Stripe." },
    { status: 410 }
  );
}
