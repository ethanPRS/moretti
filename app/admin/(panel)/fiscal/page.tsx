import Link from "next/link";
import { connection } from "next/server";
import { EstadoComprobante } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageHead, Money } from "@/components/ui";
import { Estado, Iniciales } from "@/components/admin/Bo";
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
 * distingue a simple vista. Arriba, la próxima fecha límite con su cuenta
 * regresiva; abajo, una fila por comprobante con su folio a la mano (D-47).
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

  const proxima = pendientes[0];
  const diasProxima = proxima ? diasParaVencer(proxima.fechaLimite, hoy) : 0;
  const urgProxima = proxima ? urgenciaComprobante(proxima.fechaLimite, hoy) : "a_tiempo";
  const totalPendiente = pendientes.reduce((a, c) => a + Number(c.monto), 0);

  return (
    <div className="flex flex-col gap-8">
      <PageHead
        eyebrow="Fiscal"
        titulo="Comprobantes pendientes"
        descripcion="Cada cobro necesita su comprobante a más tardar el día 5 del mes siguiente. Cuando lo emitas, pega aquí su folio."
      />

      <div className="bo-hero">
        <div className="bo-principal">
          <p className="bo-k">Por emitir</p>
          <p className="bo-v">{pendientes.length}</p>
          <p className="bo-nota"><Money valor={totalPendiente} /> en cobros</p>
        </div>
        <div>
          <p className="bo-k">Vencidos</p>
          <p className={`bo-v ${vencidos ? "alerta" : ""}`}>{vencidos}</p>
          <p className="bo-nota">Ya pasó su fecha</p>
        </div>
        <div>
          <p className="bo-k">Por vencer</p>
          <p className="bo-v">{porVencer}</p>
          <p className="bo-nota">{DIAS_ALERTA_FISCAL} días o menos</p>
        </div>
        <div>
          <p className="bo-k">Emitidos</p>
          <p className="bo-v">{emitidos}</p>
          <p className="bo-nota">Con su folio</p>
        </div>
      </div>

      {pendientes.length === 0 ? (
        <Estado tipo="ok" titulo="Todo emitido">No hay comprobantes pendientes. Cada cobro nuevo agrega el suyo aquí.</Estado>
      ) : (
        <div className="bo-card bo-limite">
          <div className={`bo-limite-dias ${urgProxima === "vencido" ? "late" : urgProxima === "por_vencer" ? "warn" : ""}`}>
            <b>{Math.abs(diasProxima)}</b>
            <span>{urgProxima === "vencido" ? "días tarde" : Math.abs(diasProxima) === 1 ? "día" : "días"}</span>
          </div>
          <div>
            <h3>Próxima fecha límite: {fechaLarga(proxima!.fechaLimite)}</h3>
            <p>
              {grupos.get(proxima!.fechaLimite.toISOString().slice(0, 10))!.length} comprobantes vencen ese día.
              {vencidos > 0 && <> Hay <b className="text-warm">{vencidos} vencidos</b>: emítelos primero.</>}
            </p>
          </div>
        </div>
      )}

      {[...grupos.entries()].map(([clave, lista]) => {
        const limite = lista[0].fechaLimite;
        const dias = diasParaVencer(limite, hoy);
        const chip = CHIP[urgenciaComprobante(limite, hoy)](dias);
        const total = lista.reduce((a, c) => a + Number(c.monto), 0);
        return (
          <section key={clave} className="bo-seccion">
            <div className="bo-seccion-t">
              <h2>Vencen el {fechaLarga(limite)}</h2>
              <span className={`chip ${chip.clase}`}>{chip.texto}</span>
              <span>
                {lista.length} {lista.length === 1 ? "comprobante" : "comprobantes"} · <Money valor={total} />
              </span>
            </div>
            <div className="bo-lista">
              {lista.map((c) => {
                const { plan, exhibicion } = c.pago;
                const u = plan.comprador.unidad;
                return (
                  <div key={c.id} className="bo-fila">
                    <Iniciales nombre={plan.comprador.nombre} />
                    <div className="bo-quien">
                      <Link href={`/admin/planes/${plan.id}`} className="hover:text-accent">
                        <b>{plan.comprador.nombre}</b>
                      </Link>
                      <span>{u.torre} {u.numero} · {plan.comprador.folio}</span>
                    </div>
                    <div className="bo-que">
                      {conceptoExhibicion(exhibicion.numero, exhibicion.tipo)}
                      <small>Cobrado el {c.fechaCobro.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</small>
                    </div>
                    <p className="bo-monto"><Money valor={Number(c.monto)} /></p>
                    <EmitirForm id={c.id} />
                  </div>
                );
              })}
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
