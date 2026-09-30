import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { EstadoExhibicion, EstadoPlan } from "@prisma/client";
import { PageHead, Money, ChipEstadoFinanciero } from "@/components/ui";

export default async function PanelPage() {
  // En cada visita, no al compilar: lee la base.
  await connection();
  const [planes, unidadesLibres, pagos, cuentas] = await Promise.all([
    prisma.plan.findMany({
      where: { estado: { not: EstadoPlan.CANCELADO } },
      include: {
        comprador: { include: { unidad: { include: { proyecto: true } } } },
        paquete: true,
        exhibiciones: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.unidad.count({ where: { comprador: null } }),
    prisma.pago.findMany(),
    Promise.all([
      prisma.proyecto.count(),
      prisma.prototipo.count(),
      prisma.unidad.count(),
      prisma.precio.count({ where: { vigenteHasta: null } }),
      prisma.paquete.count({ where: { imagen: { not: null } } }),
    ]),
  ]);
  const [nProyectos, nPrototipos, nUnidades, nPrecios, nPaquetesConFoto] = cuentas;

  // La guía se palomea sola con lo que ya hay en la base.
  const GUIA = [
    { hecho: nProyectos > 0, titulo: "Crea un proyecto", texto: "El desarrollo, su anticipo, comisión y foto.", href: "/admin/proyectos/nuevo", accion: "Crear" },
    { hecho: nPrototipos > 0, titulo: "Agrega sus prototipos", texto: "Cada tipo de departamento, con metros y recámaras.", href: "/admin/proyectos", accion: "Ir" },
    { hecho: nUnidades > 0, titulo: "Da de alta las unidades", texto: "Torre y número; se pueden agregar por rango.", href: "/admin/proyectos", accion: "Ir" },
    { hecho: nPrecios > 0, titulo: "Ponle precio a cada paquete", texto: "Por prototipo. Sin precio, no aparece en el cotizador.", href: "/admin/proyectos", accion: "Ir" },
    { hecho: nPaquetesConFoto > 0, titulo: "Revisa los paquetes", texto: "Nombre, lo que incluyen e imagen para el sitio.", href: "/admin/catalogo", accion: "Editar" },
    { hecho: planes.length > 0, titulo: "Aparta el primer depa", texto: "Desde el sitio o dando de alta al comprador en una unidad.", href: "/#cotiza", accion: "Ver sitio" },
  ];
  const pendientes = GUIA.filter((g) => !g.hecho).length;

  const cobrado = pagos.reduce((acc, p) => acc + Number(p.monto), 0);
  const comision = pagos.reduce((acc, p) => acc + Number(p.montoComision), 0);
  const porCobrar = planes
    .filter((p) => p.estado === EstadoPlan.ACTIVO)
    .reduce((acc, p) => acc + Number(p.saldo), 0);
  const cotizaciones = planes.filter((p) => p.estado === EstadoPlan.COTIZADO).length;

  return (
    <div className="flex flex-col gap-10">
      <PageHead
        eyebrow="Inicio"
        titulo="La cartera, de un vistazo."
        descripcion="Quién ya apartó, cuánto se ha cobrado y qué falta configurar."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="panel-kpi" data-destacado="">
          <p className="k">Cobrado</p>
          <p className="v"><Money valor={cobrado} /></p>
        </div>
        <div className="panel-kpi">
          <p className="k">Por cobrar</p>
          <p className="v"><Money valor={porCobrar} /></p>
        </div>
        <div className="panel-kpi">
          <p className="k">Comisión devengada</p>
          <p className="v"><Money valor={comision} /></p>
        </div>
        <div className="panel-kpi">
          <p className="k">Planes vivos · unidades libres</p>
          <p className="v">{planes.length} · {unidadesLibres}</p>
        </div>
      </div>

      <section className="card grid gap-6 p-6 sm:p-8 lg:grid-cols-[260px_1fr]">
        <div>
          <p className="panel-etiqueta">Paso a paso</p>
          <h2 className="mt-2 text-[26px] leading-tight">
            {pendientes === 0 ? "Todo configurado." : `Te ${pendientes === 1 ? "falta 1 paso" : `faltan ${pendientes} pasos`}.`}
          </h2>
          <p className="mt-2 text-[14px] text-ink-2">
            El orden para dejar un proyecto listo para vender en el sitio.
          </p>
        </div>
        <ol className="guia">
          {GUIA.map((g, i) => (
            <li key={g.titulo} data-listo={g.hecho ? "" : undefined}>
              <span className="guia-marca">{g.hecho ? "✓" : i + 1}</span>
              <div className="guia-texto">
                <p className="font-semibold">{g.titulo}</p>
                <p className="text-[13.5px] text-muted">{g.texto}</p>
              </div>
              {!g.hecho && (
                <Link href={g.href} className="btn btn-ghost btn-sm">{g.accion}</Link>
              )}
            </li>
          ))}
        </ol>
      </section>

      <h2 className="-mb-4 text-[24px]">Compradores</h2>
      {planes.length === 0 ? (
        <div className="card flex flex-col items-start gap-4 p-8">
          <div>
            <h2 className="text-[22px]">Todavía no hay ningún plan</h2>
            <p className="mt-2 max-w-[52ch] text-ink-2">
              Hay {unidadesLibres} unidades sin comprador. Entra a un proyecto, elige una
              unidad libre y registra a su comprador para generar la primera cotización.
            </p>
          </div>
          <Link href="/admin/proyectos" className="btn">
            Ver proyectos
          </Link>
        </div>
      ) : (
        <div className="card overflow-x-auto p-5">
          <table className="tbl">
            <thead>
              <tr>
                <th>Comprador</th>
                <th>Unidad</th>
                <th>Paquete</th>
                <th className="r">Cobrado</th>
                <th className="r">Saldo</th>
                <th className="r">Estado</th>
              </tr>
            </thead>
            <tbody>
              {planes.map((plan) => {
                const pagadas = plan.exhibiciones.filter(
                  (e) => e.estado === EstadoExhibicion.PAGADA
                );
                const cobradoPlan = pagadas.reduce((acc, e) => acc + Number(e.monto), 0);
                const unidad = plan.comprador.unidad;
                return (
                  <tr key={plan.id}>
                    <td>
                      <Link href={`/admin/planes/${plan.id}`} className="hover:text-accent">
                        {plan.comprador.nombre}
                      </Link>
                      <span className="ml-2 font-mono text-[11px] text-muted">
                        {plan.comprador.folio}
                      </span>
                    </td>
                    <td>
                      {unidad.torre} {unidad.numero}
                      <span className="block text-[12px] text-muted">
                        {unidad.proyecto.nombre}
                      </span>
                    </td>
                    <td>{plan.paquete.nombre}</td>
                    <td className="r">
                      <Money valor={cobradoPlan} />
                    </td>
                    <td className="r">
                      <Money valor={Number(plan.saldo)} />
                    </td>
                    <td className="r">
                      <ChipEstadoFinanciero estado={unidad.estadoFinanciero} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {cotizaciones > 0 && (
        <p className="note">
          <b>
            {cotizaciones} {cotizaciones === 1 ? "plan sigue" : "planes siguen"} en
            cotización.
          </b>{" "}
          El precio no queda congelado hasta que se cobra el anticipo, y el anticipo no se
          puede cobrar sin contrato firmado.
        </p>
      )}
    </div>
  );
}
