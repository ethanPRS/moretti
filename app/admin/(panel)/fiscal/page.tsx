import Link from "next/link";
import { connection } from "next/server";
import { EstadoComprobante } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageHead, Money, Stat } from "@/components/ui";
import { DIAS_ALERTA_FISCAL, diasParaVencer, urgenciaComprobante, type Urgencia } from "@/lib/motor/fiscal";
import { conceptoExhibicion } from "@/lib/motor/recalculo";
import EmitirForm from "./EmitirForm";

const fechaLarga = (f: Date) =>
  f.toLocaleDateString("es-MX", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });

const CHIP: Record<Urgencia, (dias: number) => { clase: string; texto: string }> = {
  vencido: (d) => ({ clase: "late", texto: `Vencido hace ${-d} ${-d === 1 ? "día" : "días"}` }),
  por_vencer: (d) => ({ clase: "warn", texto: d === 0 ? "Vence hoy" : `Vence en ${d} ${d === 1 ? "día" : "días"}` }),
  a_tiempo: (d) => ({ clase: "wait", texto: `En ${d} días` }),
};

/**
 * Comprobantes fiscales pendientes (actividad S, R8). Agrupados por fecha
 * límite porque el problema es el volumen: todos los planes vencen el mismo
 * día 5. Lo vencido y lo que vence en DIAS_ALERTA_FISCAL días o menos se
 * distingue a simple vista.
 */
export default async function FiscalPage() {
  await connection();
  const pendientes = await prisma.comprobanteFiscal.findMany({
    where: { estado: EstadoComprobante.PENDIENTE },
    include: {
      pago: {
        include: {
          exhibicion: true,
          plan: { include: { comprador: { include: { unidad: true } } } },
        },
      },
    },
    orderBy: [{ fechaLimite: "asc" }, { fechaCobro: "asc" }],
  });
  const emitidos = await prisma.comprobanteFiscal.count({ where: { estado: EstadoComprobante.EMITIDO } });

  const hoy = new Date();
  const grupos = new Map<string, typeof pendientes>();
  for (const c of pendientes) {
    const clave = c.fechaLimite.toISOString().slice(0, 10);
    grupos.set(clave, [...(grupos.get(clave) ?? []), c]);
  }
  const vencidos = pendientes.filter((c) => urgenciaComprobante(c.fechaLimite, hoy) === "vencido").length;
  const porVencer = pendientes.filter((c) => urgenciaComprobante(c.fechaLimite, hoy) === "por_vencer").length;

  return (
    <div className="flex flex-col gap-9">
      <PageHead
        eyebrow="Fiscal"
        titulo="Comprobantes pendientes"
        descripcion="Todo cobro nace sin comprobante (R8). Se emite a más tardar el día 5 del mes siguiente, recorrido al siguiente hábil."
      />

      <div className="card grid grid-cols-2 gap-7 p-7 sm:grid-cols-4">
        <Stat etiqueta="Pendientes" valor={pendientes.length} />
        <Stat etiqueta="Vencidos" valor={<span className={vencidos ? "text-warm" : ""}>{vencidos}</span>} />
        <Stat etiqueta="Por vencer" valor={porVencer} nota={`${DIAS_ALERTA_FISCAL} días o menos`} />
        <Stat etiqueta="Emitidos" valor={emitidos} />
      </div>

      {pendientes.length === 0 && (
        <p className="note">No hay comprobantes pendientes. Cada cobro nuevo agrega el suyo aquí.</p>
      )}

      {[...grupos.entries()].map(([clave, lista]) => {
        const limite = lista[0].fechaLimite;
        const dias = diasParaVencer(limite, hoy);
        const chip = CHIP[urgenciaComprobante(limite, hoy)](dias);
        const total = lista.reduce((a, c) => a + Number(c.monto), 0);
        return (
          <section key={clave} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="label">Vencen el {fechaLarga(limite)}</p>
              <span className={`chip ${chip.clase}`}>{chip.texto}</span>
              <span className="text-[12.5px] text-muted">
                {lista.length} {lista.length === 1 ? "comprobante" : "comprobantes"} · <Money valor={total} />
              </span>
            </div>
            <div className="card overflow-x-auto p-5">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Comprador</th>
                    <th>Concepto</th>
                    <th>Cobrado</th>
                    <th className="r">Monto</th>
                    <th>Cerrar</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((c) => {
                    const { plan, exhibicion } = c.pago;
                    const u = plan.comprador.unidad;
                    return (
                      <tr key={c.id}>
                        <td>
                          <Link href={`/admin/planes/${plan.id}`} className="font-medium hover:text-accent">
                            {plan.comprador.nombre}
                          </Link>
                          <span className="block text-[12px] text-muted">
                            {u.torre} {u.numero} · {plan.comprador.folio}
                          </span>
                        </td>
                        <td>{conceptoExhibicion(exhibicion.numero, exhibicion.tipo)}</td>
                        <td>{c.fechaCobro.toLocaleDateString("es-MX")}</td>
                        <td className="r">
                          <Money valor={Number(c.monto)} />
                        </td>
                        <td className="w-[300px]">
                          <EmitirForm id={c.id} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <p className="text-[12.5px] text-muted">
        Fuera de este prototipo: leer el XML del CFDI y consultarlo al SAT. Aquí se cierra a mano con su folio.
      </p>
    </div>
  );
}
