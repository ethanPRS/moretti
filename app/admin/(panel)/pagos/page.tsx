import Link from "next/link";
import { EstadoExhibicion, EstadoPlan } from "@prisma/client";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { PageHead, Money } from "@/components/ui";
import { EstadoPago } from "@prisma/client";

type MovimientoReal = {
  id: string;
  fecha: Date;
  comprador: string;
  folio: string;
  unidad: string;
  planId: string;
  concepto: string;
  monto: number;
  comision: number;
  referencia: string | null;
};

const fecha = (d: Date) =>
  d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
const hora = (d: Date) =>
  d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

const FILTROS = [
  { id: "todos", texto: "Todos" },
  { id: "confirmados", texto: "Confirmados" },
] as const;
type Filtro = (typeof FILTROS)[number]["id"];

const pasaFiltro = (_m: MovimientoReal, filtro: Filtro) => filtro === "todos" || filtro === "confirmados";

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const pedido = (await searchParams).filtro;
  const filtro: Filtro = FILTROS.some((f) => f.id === pedido) ? (pedido as Filtro) : "todos";
  // En cada visita, no al compilar: lee la base.
  await connection();
  const [pagos, proximas, cuentas] = await Promise.all([
    prisma.pago.findMany({
      include: {
        exhibicion: true,
        plan: { include: { comprador: { include: { unidad: true } } } },
      },
      orderBy: { fecha: "desc" },
    }),
    prisma.exhibicion.findMany({
      where: {
        estado: { in: [EstadoExhibicion.PENDIENTE, EstadoExhibicion.VENCIDA] },
        plan: { estado: { in: [EstadoPlan.ACTIVO, EstadoPlan.SUSPENDIDO] } },
      },
      include: { plan: { include: { comprador: { include: { unidad: true } } } } },
      orderBy: { fechaProgramada: "asc" },
      take: 6,
    }),
    prisma.proyecto.findMany({
      where: { stripeConnectedAccountId: { not: null } },
      select: { id: true, nombre: true, stripeConnectedAccountId: true },
      orderBy: { nombre: "asc" },
    }),
  ]);

  const movimientos: MovimientoReal[] = pagos
    .filter((p) => p.estado === EstadoPago.CONFIRMADO)
    .map((p) => {
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
      referencia: p.referenciaStripe,
      planId: p.planId,
    };
  });

  const bruto = movimientos.reduce((acc, m) => acc + m.monto, 0);
  const comision = movimientos.reduce((acc, m) => acc + m.comision, 0);
  const neto = bruto - comision;
  const visibles = movimientos.filter((m) => pasaFiltro(m, filtro));
  const pct = (n: number) => (bruto > 0 ? (n / bruto) * 100 : 0);
  const stripeConfigurado =
    process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_");

  return (
    <div className="flex flex-col gap-10">
      <PageHead
        eyebrow="Pagos · Stripe"
        titulo="Lo que entró y lo que viene."
        descripcion="Movimientos confirmados por el servidor y próximas exhibiciones de los planes."
        accion={<span className={`chip ${stripeConfigurado ? "info" : "wait"}`}>{stripeConfigurado ? "Modo prueba" : "Configuración de Stripe pendiente"}</span>}
      />

      {!stripeConfigurado && (
        <p className="note blocked" role="status">
          Faltan las llaves publicable y secreta de prueba. No se habilitan operaciones de pago.
        </p>
      )}

      <section className="card flex flex-col gap-6 p-6 sm:p-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="panel-kpi" data-destacado="">
            <p className="k">Cobrado</p>
            <p className="v"><Money valor={bruto} /></p>
          </div>
          <div className="panel-kpi">
            <p className="k">Para Moretti, antes de tarifa Stripe</p>
            <p className="v"><Money valor={Math.round(neto)} /></p>
          </div>
          <div className="panel-kpi">
            <p className="k">Comisión día uno</p>
            <p className="v"><Money valor={comision} /></p>
          </div>
          <div className="panel-kpi">
            <p className="k">Movimientos confirmados</p>
            <p className="v">{movimientos.length}</p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-[14px] text-ink-2">Distribución registrada por el plan, antes de las tarifas de Stripe:</p>
          <div className="reparto" role="img" aria-label={`Moretti ${pct(neto).toFixed(1)} %, día uno ${pct(comision).toFixed(1)} %`}>
            <span style={{ width: `${pct(neto)}%`, background: "var(--accent)" }} />
            <span style={{ width: `${pct(comision)}%`, background: "var(--warm)" }} />
          </div>
          <p className="reparto-leyenda">
            <span><i style={{ background: "var(--accent)" }} />Moretti {pct(neto).toFixed(1)} %</span>
            <span><i style={{ background: "var(--warm)" }} />día uno {pct(comision).toFixed(1)} %</span>
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-[24px]">Movimientos</h2>
          <nav className="filtros" aria-label="Filtrar movimientos">
            {FILTROS.map((f) => (
              <Link
                key={f.id}
                href={f.id === "todos" ? "/admin/pagos" : `/admin/pagos?filtro=${f.id}`}
                className="filtro"
                aria-current={filtro === f.id ? "true" : undefined}
                scroll={false}
              >
                {f.texto}
                <b>{movimientos.filter((m) => pasaFiltro(m, f.id)).length}</b>
              </Link>
            ))}
          </nav>
        </div>
        <div className="card overflow-x-auto p-5">
          <table className="tbl">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Comprador</th>
                <th>Concepto</th>
                <th className="r">Monto</th>
                <th className="r">Comisión</th>
                <th>Referencia</th>
                <th className="r">Estado servidor</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted">No hay movimientos confirmados.</td>
                </tr>
              )}
              {visibles.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">
                    {fecha(m.fecha)}
                    <span className="block text-[12px] text-muted">{hora(m.fecha)}</span>
                  </td>
                  <td className="whitespace-nowrap">
                    <Link href={`/admin/planes/${m.planId}`} className="hover:text-accent">
                      {m.comprador}
                    </Link>
                    <span className="block text-[12px] text-muted">
                      {m.folio} · {m.unidad}
                    </span>
                  </td>
                  <td>
                    {m.concepto}
                    <span className="block text-[12px] text-muted">Tarjeta</span>
                  </td>
                  <td className="r">
                    <Money valor={m.monto} />
                  </td>
                  <td className="r">
                    <Money valor={m.comision} />
                  </td>
                  <td>
                    <span className="font-mono text-[11.5px]">{m.referencia ?? "—"}</span>
                  </td>
                  <td className="r">
                    <span className="chip ok">Confirmado</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] text-muted">
          La referencia y el estado se muestran sólo después de que el webhook aplica el pago en el servidor.
          La tarifa de Stripe no se calcula en esta pantalla porque aún no se consulta desde el balance de Stripe.
        </p>
      </section>

      <div className="grid gap-6">
        <section className="flex flex-col gap-4">
          <h2 className="text-[24px]">Próximos cobros</h2>
          <div className="card p-5">
            {proximas.length === 0 ? (
              <p className="text-ink-2">No hay mensualidades programadas.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {proximas.map((ex) => (
                  <li key={ex.id} className="flex items-center gap-4 py-3">
                    <span className="fecha-bloque">
                      <b>{ex.fechaProgramada.getDate()}</b>
                      <span>{ex.fechaProgramada.toLocaleDateString("es-MX", { month: "short" }).replace(".", "")}</span>
                    </span>
                    <div className="flex-1">
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
                    <p className="figure text-[17px]">
                      <Money valor={Number(ex.monto)} />
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6">
        <section className="flex flex-col gap-4">
          <h2 className="text-[24px]">Cuentas de Stripe Connect</h2>
          <div className="grid gap-3">
            {cuentas.map((cuenta) => (
              <div key={cuenta.id} className="card flex items-start justify-between gap-4 p-5">
                <div>
                  <p className="label">Cuenta conectada · Moretti</p>
                  <p className="mt-1 text-[18px] font-semibold">{cuenta.nombre}</p>
                  <p className="font-mono text-[11.5px] text-muted">{cuenta.stripeConnectedAccountId}</p>
                </div>
                <span className="chip info">Registrada en proyecto</span>
              </div>
            ))}
            {cuentas.length === 0 && <p className="note blocked">Ningún proyecto tiene cuenta conectada configurada.</p>}
          </div>
        </section>

      </div>
    </div>
  );
}
