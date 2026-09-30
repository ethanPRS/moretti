import Link from "next/link";
import { EstadoExhibicion, EstadoPlan } from "@prisma/client";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { PageHead, Money } from "@/components/ui";
import {
  CUENTAS,
  MOVIMIENTOS_SIMULADOS,
  WEBHOOKS_SIMULADOS,
  tarifaStripe,
  type EstadoMovimiento,
  type Movimiento,
} from "@/lib/pasarela/simulacion";

const ESTADO: Record<EstadoMovimiento, { texto: string; clase: string }> = {
  exitoso: { texto: "Exitoso", clase: "ok" },
  rechazado: { texto: "Rechazado", clase: "late" },
  requiere_accion: { texto: "Requiere acción", clase: "info" },
  reembolsado: { texto: "Reembolsado", clase: "wait" },
  en_proceso: { texto: "En proceso", clase: "wait" },
};

/** plan_cmuhnhnq8006oi7wy9ls7mtgj:exh_2:int_1 → plan_…ls7mtgj:exh_2:int_1. La completa va en el title. */
const llaveCorta = (llave: string) =>
  llave.length > 30 ? `${llave.slice(0, 5)}…${llave.slice(-19)}` : llave;

const fecha = (d: Date) =>
  d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
const hora = (d: Date) =>
  d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

export default async function PagosPage() {
  // En cada visita, no al compilar: lee la base.
  await connection();
  const [pagos, proximas] = await Promise.all([
    prisma.pago.findMany({
      include: {
        exhibicion: true,
        plan: { include: { comprador: { include: { unidad: true } } } },
      },
      orderBy: { fecha: "desc" },
    }),
    prisma.exhibicion.findMany({
      where: {
        estado: EstadoExhibicion.PENDIENTE,
        plan: { estado: EstadoPlan.ACTIVO },
      },
      include: { plan: { include: { comprador: { include: { unidad: true } } } } },
      orderBy: { fechaProgramada: "asc" },
      take: 6,
    }),
  ]);

  // Los cobros reales del motor (hoy contra la pasarela falsa).
  const reales: Movimiento[] = pagos.map((p) => {
    const u = p.plan.comprador.unidad;
    return {
      id: p.id,
      fecha: p.fecha,
      comprador: p.plan.comprador.nombre,
      folio: p.plan.comprador.folio,
      unidad: `${u.torre} ${u.numero}`,
      concepto:
        p.exhibicion.numero === 0 ? "Anticipo" : `Mensualidad ${p.exhibicion.numero} de 12`,
      monto: Number(p.monto),
      comision: Number(p.montoComision),
      metodo: "tarjeta",
      estado: "exitoso",
      referencia: p.referenciaStripe ?? "pasarela de prueba",
      llave: `plan_${p.planId}:exh_${p.exhibicion.numero}:int_1`,
      simulado: false,
    };
  });

  const movimientos = [...reales, ...MOVIMIENTOS_SIMULADOS].sort(
    (a, b) => b.fecha.getTime() - a.fecha.getTime()
  );

  const cobrados = movimientos.filter((m) => m.estado === "exitoso");
  const bruto = cobrados.reduce((acc, m) => acc + m.monto, 0);
  const comision = cobrados.reduce((acc, m) => acc + m.comision, 0);
  // Stripe cobra también en lo reembolsado: su comisión nunca regresa.
  const stripe = movimientos
    .filter((m) => m.estado === "exitoso" || m.estado === "reembolsado")
    .reduce((acc, m) => acc + tarifaStripe(m.monto, m.metodo), 0);
  const neto = bruto - comision - stripe;
  const atencion = movimientos.filter(
    (m) => m.estado === "rechazado" || m.estado === "requiere_accion"
  ).length;

  return (
    <div className="flex flex-col gap-10">
      <PageHead
        eyebrow="Cobranza · Stripe"
        titulo="Pagos"
        descripcion="Lo que entró, lo que rebotó y lo que viene. Cargo directo sobre la cuenta de Moretti; la comisión del canal se separa en el mismo cobro."
        accion={<span className="chip info">Modo prueba · datos simulados</span>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="kpi">
          <p className="k">Cobrado</p>
          <p className="v">
            <Money valor={bruto} />
          </p>
        </div>
        <div className="kpi">
          <p className="k">Comisión día uno</p>
          <p className="v">
            <Money valor={comision} />
          </p>
        </div>
        <div className="kpi">
          <p className="k">Tarifa Stripe</p>
          <p className="v">
            <Money valor={Math.round(stripe)} />
          </p>
        </div>
        <div className="kpi">
          <p className="k">Neto a Moretti</p>
          <p className="v">
            <Money valor={Math.round(neto)} />
          </p>
        </div>
      </div>

      {atencion > 0 && (
        <p className="note blocked">
          <b>
            {atencion} {atencion === 1 ? "cobro necesita" : "cobros necesitan"} atención.
          </b>{" "}
          Un rechazo se reintenta según su código; uno que pide autenticación espera a que
          el comprador abra la liga. Ninguno cambia el estado del plan todavía.
        </p>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-[22px]">Movimientos</h2>
        <div className="card overflow-x-auto p-5">
          <table className="tbl">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Comprador</th>
                <th>Concepto</th>
                <th className="r">Monto</th>
                <th className="r">Comisión</th>
                <th className="r">Stripe</th>
                <th>Referencia</th>
                <th className="r">Estado</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">
                    {fecha(m.fecha)}
                    <span className="block text-[12px] text-muted">{hora(m.fecha)}</span>
                  </td>
                  <td className="whitespace-nowrap">
                    {m.comprador}
                    <span className="block text-[12px] text-muted">
                      {m.folio} · {m.unidad}
                    </span>
                  </td>
                  <td>
                    {m.concepto}
                    <span className="block text-[12px] text-muted">
                      {m.metodo === "spei" ? "SPEI" : "Tarjeta"}
                      {m.detalle ? ` · ${m.detalle}` : ""}
                    </span>
                  </td>
                  <td className="r">
                    <Money valor={m.monto} />
                  </td>
                  <td className="r">
                    <Money valor={m.comision} />
                  </td>
                  <td className="r text-muted">
                    {m.estado === "exitoso" || m.estado === "reembolsado" ? (
                      <Money valor={tarifaStripe(m.monto, m.metodo)} conCentavos />
                    ) : (
                      "$0"
                    )}
                  </td>
                  <td>
                    <span className="font-mono text-[11.5px]">{m.referencia}</span>
                    <span className="block font-mono text-[11px] text-muted" title={m.llave}>
                      {llaveCorta(m.llave)}
                    </span>
                  </td>
                  <td className="r">
                    <span className={`chip ${ESTADO[m.estado].clase}`}>
                      {ESTADO[m.estado].texto}
                    </span>
                    {m.simulado && (
                      <span className="mt-1 block text-[11px] text-muted">simulado</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] text-muted">
          Tarifa Stripe México sin IVA: tarjeta 3.6 % + $3 por cobro exitoso, SPEI $7 fijo.
          Stripe no la devuelve en un reembolso. La llave de idempotencia es la que evita
          el doble cargo.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-4">
          <h2 className="text-[22px]">Próximos cobros</h2>
          <div className="card p-5">
            {proximas.length === 0 ? (
              <p className="text-ink-2">No hay mensualidades programadas.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {proximas.map((ex) => (
                  <li key={ex.id} className="flex items-center justify-between gap-4 py-2.5">
                    <div>
                      <Link
                        href={`/admin/planes/${ex.planId}`}
                        className="hover:text-accent"
                      >
                        {ex.plan.comprador.nombre}
                      </Link>
                      <span className="block text-[12px] text-muted">
                        Mensualidad {ex.numero} de 12 · fuera de sesión
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="figure">
                        <Money valor={Number(ex.monto)} />
                      </p>
                      <p className="text-[12px] text-muted">{fecha(ex.fechaProgramada)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-[22px]">Webhooks recientes</h2>
          <div className="card p-5">
            <ul className="flex flex-col divide-y divide-line">
              {WEBHOOKS_SIMULADOS.map((w, i) => (
                <li key={w.id + i} className="flex items-start justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="font-mono text-[12.5px]">{w.tipo}</p>
                    <p className="text-[12.5px] text-muted">{w.nota}</p>
                  </div>
                  <span
                    className={`chip shrink-0 ${
                      w.resultado === "procesado"
                        ? "ok"
                        : w.resultado === "duplicado"
                          ? "wait"
                          : "info"
                    }`}
                  >
                    {w.resultado}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <div className="grid gap-6">
        <section className="flex flex-col gap-4">
          <h2 className="text-[22px]">Cuentas de Stripe Connect</h2>
          <div className="grid gap-3">
            {CUENTAS.map((c) => (
              <div key={c.id} className="card flex items-start justify-between gap-4 p-5">
                <div>
                  <p className="label">{c.rol}</p>
                  <p className="mt-1 text-[18px] font-semibold">{c.nombre}</p>
                  <p className="font-mono text-[11.5px] text-muted">{c.id}</p>
                  <p className="mt-2 text-[13.5px] text-ink-2">{c.nota}</p>
                </div>
                <span className={`chip shrink-0 ${c.estado === "Modo prueba" ? "info" : "late"}`}>
                  {c.estado}
                </span>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
