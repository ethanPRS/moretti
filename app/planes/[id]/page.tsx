import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import MarcarPagadaButton from "./MarcarPagadaButton";

export default async function PlanDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const plan = await prisma.plan.findUnique({
    where: { id },
    include: {
      comprador: { include: { unidad: { include: { proyecto: true, prototipo: true } } } },
      paquete: true,
      precio: true,
      exhibiciones: { orderBy: { numero: "asc" } },
    },
  });

  if (!plan) notFound();

  const unidad = plan.comprador.unidad;
  const pagado = plan.exhibiciones
    .filter((e) => e.estado === "Pagada")
    .reduce((acc, e) => acc + Number(e.monto), 0);
  const total = Number(plan.precio.monto);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Estado de cuenta</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {plan.comprador.nombre} · {unidad.proyecto.nombre} · Torre {unidad.torre}/
          {unidad.numero} · {unidad.prototipo.clave} · {plan.paquete.nombre}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Precio congelado" value={`$${total.toLocaleString("es-MX")}`} />
        <Stat label="Pagado a la fecha" value={`$${pagado.toLocaleString("es-MX")}`} />
        <Stat
          label="Saldo"
          value={`$${Number(plan.saldo).toLocaleString("es-MX")}`}
        />
      </div>

      <div className="text-sm">
        Estado del plan:{" "}
        <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white">
          {plan.estado}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Concepto</th>
              <th className="px-4 py-2">Fecha programada</th>
              <th className="px-4 py-2">Monto</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {plan.exhibiciones.map((ex) => (
              <tr key={ex.id} className="border-t border-zinc-100">
                <td className="px-4 py-2">{ex.numero}</td>
                <td className="px-4 py-2">
                  {ex.numero === 0 ? "Anticipo" : `Mensualidad ${ex.numero}`}
                </td>
                <td className="px-4 py-2">
                  {new Date(ex.fechaProgramada).toLocaleDateString("es-MX")}
                </td>
                <td className="px-4 py-2">${Number(ex.monto).toLocaleString("es-MX")}</td>
                <td className="px-4 py-2">
                  <span
                    className={
                      ex.estado === "Pagada"
                        ? "text-emerald-600"
                        : ex.estado === "Vencida"
                          ? "text-red-600"
                          : "text-zinc-500"
                    }
                  >
                    {ex.estado}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  {ex.estado !== "Pagada" && <MarcarPagadaButton planId={plan.id} exhibicionId={ex.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-400">
        &ldquo;Marcar como pagada&rdquo; es una simulación manual para este
        prototipo — el cobro automático real contra la pasarela (Stripe test
        mode) es el siguiente corte del proyecto (A.2).
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-sm text-zinc-500">{label}</div>
    </div>
  );
}
