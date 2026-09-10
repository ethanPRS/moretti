import { NextResponse } from "next/server";
import { cobrarExhibicion, ReglaError } from "@/lib/motor/planes";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await cobrarExhibicion(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ReglaError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
