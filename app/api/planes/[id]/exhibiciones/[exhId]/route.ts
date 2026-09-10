import { NextResponse } from "next/server";
import { marcarExhibicionPagada, GenerarPlanError } from "@/lib/motor/generarPlan";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string; exhId: string }> }
) {
  const { exhId } = await params;
  try {
    await marcarExhibicionPagada(exhId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof GenerarPlanError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
