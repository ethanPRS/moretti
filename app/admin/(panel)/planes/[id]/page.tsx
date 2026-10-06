import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EstadoExhibicion, EstadoOperativo, EstadoPlan, ModalidadPlan } from "@prisma/client";
import {
  PageHead,
  Money,
  Stat,
  ChipEstadoFinanciero,
  ChipEstadoPlan,
  CintaExhibiciones,
} from "@/components/ui";
import CobrarButton from "./CobrarButton";
import CobrarConStripe from "@/components/pagos/CobrarConStripe";
import ContratoForm from "./ContratoForm";
import AcabadoYFotos from "./AcabadoYFotos";
import EstadoFinancieroForm from "./EstadoFinancieroForm";
import ObraYEntrega from "./ObraYEntrega";
import AccionesPlan from "./AccionesPlan";
import { conceptoExhibicion } from "@/lib/motor/recalculo";
import { versionesDelPlan } from "@/lib/motor/versiones";
import { cargarCatalogo } from "@/lib/motor/catalogo";
import { bloqueoPorLevantamiento } from "@/lib/motor/operacion";

const FAMILIA = { A_LA_MEDIDA: "A la medida", DE_CATALOGO: "De catálogo", VALE: "Vale" } as const;

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const plan = await prisma.plan.findUnique({
    where: { id },
    include: {
      comprador: {
        include: {
          unidad: { include: { proyecto: true, prototipo: true, contrato: true, actaEntrega: true } },
        },
      },
      paquete: true,
      renglones: { include: { partida: true, fotos: { orderBy: { posicion: "asc" } } } },
      // Sólo lo vigente: lo reemplazado o cancelado por un recálculo vive en
      // su versión (R4) y se consulta abajo, en «Versiones del plan».
      exhibiciones: {
        where: { estado: { in: [EstadoExhibicion.PENDIENTE, EstadoExhibicion.VENCIDA, EstadoExhibicion.PAGADA] } },
        orderBy: [{ fechaProgramada: "asc" }, { numero: "asc" }],
        include: { pago: true },
      },
    },
  });
  if (!plan) notFound();

  // La bitácora del plan y la de su unidad (contrato, estado financiero).
  const eventos = await prisma.evento.findMany({
    where: {
      OR: [
        { entidadTipo: "plan", entidadId: plan.id },
        { entidadTipo: "unidad", entidadId: plan.comprador.unidadId },
      ],
    },
    orderBy: { fecha: "desc" },
  });

  const versiones = await versionesDelPlan(plan.id);
  // Los paquetes cerrados mayores con precio vigente: a dónde puede subir (T).
  const catalogo = await cargarCatalogo(plan.comprador.unidad.prototipoId);
  const nivelActual = catalogo.prototipo.paquetes.find((p) => p.id === plan.paqueteId)?.nivel ?? Infinity;
  const paquetesMayores = catalogo.prototipo.paquetes
    .filter((p) => p.nivel > nivelActual)
    .map((p) => ({ id: p.id, nombre: `${p.nombre} · $${p.precio.toLocaleString("es-MX")}` }));

  // Lo vendido es la lista de renglones; el paquete es sólo la etiqueta (spec §4).
  const renglones = [...plan.renglones].sort(
    (a, b) => a.partida.orden - b.partida.orden || a.origen.localeCompare(b.origen)
  );
  const sumaRenglones = renglones.reduce((acc, r) => acc + Number(r.precioCongelado), 0);
  const cuadra = sumaRenglones === Number(plan.montoCongelado);
  // R6: el acabado y las fotos se cambian hasta el levantamiento en obra.
  const bloqueoAcabados =
    plan.estado === EstadoPlan.CANCELADO
      ? "El plan está cancelado: ya no se cambian acabados ni fotos."
      : plan.comprador.unidad.estadoOperativo !== EstadoOperativo.PENDIENTE
        ? "Ya se hizo el levantamiento en obra: el acabado y las fotos quedaron fijos (R6)."
        : null;
  const etiqueta =
    plan.modalidad === ModalidadPlan.ARMA_EL_TUYO
      ? plan.paquete.nombre
      : plan.modalidad === ModalidadPlan.A_LISTA
        ? `${plan.paquete.nombre}, sin precio de paquete`
        : `Paquete ${plan.paquete.nombre}`;

  const unidad = plan.comprador.unidad;
  const contrato = unidad.contrato;
  const pagadas = plan.exhibiciones.filter((e) => e.estado === EstadoExhibicion.PAGADA);
  const cobrado = pagadas.reduce((acc, e) => acc + Number(e.monto), 0);
  const comision = plan.exhibiciones.reduce(
    (acc, e) => acc + (e.pago ? Number(e.pago.montoComision) : 0),
    0
  );
  const congelado = Boolean(plan.fechaCongelamiento);
  const siguiente = plan.exhibiciones.find((e) => e.estado !== EstadoExhibicion.PAGADA);
  const stripeTestConfigurado =
    process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") === true &&
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") === true;

  return (
    <div className="flex flex-col gap-9">
      <PageHead
        eyebrow="Estado de cuenta"
        titulo={plan.comprador.nombre}
        descripcion={`${unidad.proyecto.nombre} · ${unidad.torre} ${unidad.numero} · ${unidad.prototipo.clave} · ${etiqueta}`}
        accion={
          <div className="flex items-center gap-2">
            <ChipEstadoFinanciero estado={unidad.estadoFinanciero} />
            <ChipEstadoPlan estado={plan.estado} />
          </div>
        }
      />

      {plan.paquete.imagen && (
        <div className="card flex flex-col gap-5 overflow-hidden p-5 sm:flex-row sm:items-center">
          <div className="media relative aspect-[4/3] w-full shrink-0 sm:w-52">
            <Image
              src={plan.paquete.imagen}
              alt={`Interior con el paquete ${plan.paquete.nombre}`}
              fill
              sizes="(max-width: 640px) 100vw, 208px"
              className="object-cover"
            />
          </div>
          <div>
            <p className="eyebrow">Lo que contrató</p>
            <h2 className="mt-1.5 text-[22px]">{etiqueta}</h2>
            <p className="mt-1 text-[14px] text-muted">
              {plan.modalidad === ModalidadPlan.PAQUETE
                ? plan.paquete.descripcion
                : "Cada partida a su precio de lista."}
            </p>
            <p className="mt-3 max-w-[58ch] text-[13.5px] text-ink-2">
              {renglones
                .map((r) => (r.cantidad > 1 ? `${r.partida.nombre} ×${r.cantidad}` : r.partida.nombre))
                .join(" · ")}
            </p>
          </div>
        </div>
      )}

      <div className="card grid grid-cols-2 gap-7 p-7 sm:grid-cols-4">
        <Stat
          etiqueta={congelado ? "Precio congelado" : "Precio cotizado"}
          valor={<Money valor={Number(plan.montoCongelado)} />}
          nota={
            congelado
              ? `Congelado el ${plan.fechaCongelamiento!.toLocaleDateString("es-MX")}`
              : "Todavía puede cambiar"
          }
        />
        <Stat etiqueta="Cobrado" valor={<Money valor={cobrado} />} nota={`${pagadas.length} de ${plan.exhibiciones.length}${plan.version > 1 ? ` · versión ${plan.version}` : ""}`} />
        <Stat etiqueta="Saldo" valor={<Money valor={Number(plan.saldo)} />} />
        <Stat
          etiqueta="Comisión del canal"
          valor={<Money valor={comision} />}
          nota={`${(Number(unidad.proyecto.porcentajeComision) * 100).toFixed(0)} % por cobro`}
        />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="label">Lo que se vendió · partida por partida</p>
          <p className="text-[12.5px] text-muted">
            {congelado
              ? `Lista congelada con el anticipo el ${plan.fechaCongelamiento!.toLocaleDateString("es-MX")}: ya no cambia (R2).`
              : "Cotización: la lista y sus precios se congelan al cobrar el anticipo."}
          </p>
        </div>
        <div className="card overflow-x-auto p-5">
          <table className="tbl">
            <thead>
              <tr>
                <th>Partida</th>
                <th>Acabado</th>
                <th className="r">Cantidad</th>
                <th className="r">Lista por pieza</th>
                <th className="r">En este plan</th>
              </tr>
            </thead>
            <tbody>
              {renglones.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="font-medium">{r.partida.nombre}</span>
                    <span className="ml-2 inline-flex gap-1.5 align-middle">
                      <span className="chip wait">{FAMILIA[r.partida.familia]}</span>
                      {r.origen === "AGREGADA" && plan.modalidad !== ModalidadPlan.ARMA_EL_TUYO && (
                        <span className="chip info">Agregada</span>
                      )}
                    </span>
                  </td>
                  <td className={r.acabado ? "" : "text-muted"}>
                    {r.acabado
                      ? r.acabado.replace(/^Opción \d+ · /, "")
                      : r.partida.acabados
                        ? "Sin elegir"
                        : "—"}
                  </td>
                  <td className="r">{r.cantidad}</td>
                  <td className="r text-muted">
                    <Money valor={Number(r.precioLista)} />
                  </td>
                  <td className="r">
                    <Money valor={Number(r.precioCongelado)} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="font-medium">
                  Total {cuadra ? "· cuadra al peso con el plan (R7)" : "· NO cuadra con el plan"}
                </td>
                <td className={`r font-semibold ${cuadra ? "" : "text-warm"}`}>
                  <Money valor={sumaRenglones} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <p className="label">Acabados y fotos de referencia</p>
          <p className="mt-1.5 max-w-[70ch] text-[13px] text-ink-2">
            Lo que eligió el comprador viaja con la compra: al Anexo A, al expediente y a la orden
            de producción de Moretti. Se puede cambiar hasta el levantamiento en obra.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {renglones.map((r) => (
            <AcabadoYFotos
              key={r.id}
              renglonId={r.id}
              nombre={r.cantidad > 1 ? `${r.partida.nombre} ×${r.cantidad}` : r.partida.nombre}
              opciones={(r.partida.acabados as [string, string][] | null) ?? null}
              elegido={r.acabado}
              fotos={r.fotos.map((f) => ({ id: f.id, nombre: f.nombreOriginal }))}
              bloqueo={bloqueoAcabados}
            />
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3">
        <p className="label">Avance del plan</p>
        <CintaExhibiciones exhibiciones={plan.exhibiciones} />
      </div>

      {!congelado && (
        <p className={`note ${contrato ? "" : "blocked"}`}>
          {contrato ? (
            <>
              <b>Listo para cobrar el anticipo.</b> El contrato quedó firmado por{" "}
              {contrato.quienFirmo} el {contrato.fechaFirma.toLocaleDateString("es-MX")}. Al cobrar
              el anticipo, el precio se congela y la unidad pasa a apartada.
            </>
          ) : (
            <>
              <b>No se puede cobrar todavía: falta el contrato firmado.</b> El precio sigue siendo
              una cotización y puede cambiar. Registra el contrato para poder cobrar el anticipo.
            </>
          )}
        </p>
      )}

      {!contrato && <ContratoForm unidadId={unidad.id} />}

      <div className="card overflow-x-auto p-5">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Concepto</th>
              <th>Fecha programada</th>
              <th className="r">Monto</th>
              <th className="r">Comisión</th>
              <th className="r">Estado</th>
              <th>Referencia</th>
              <th className="r" />
            </tr>
          </thead>
          <tbody>
            {plan.exhibiciones.map((ex) => (
              <tr key={ex.id}>
                <td className="text-muted">{ex.tipo === "MENSUALIDAD" || ex.tipo === "ANTICIPO" ? ex.numero : "—"}</td>
                <td>{conceptoExhibicion(ex.numero, ex.tipo)}</td>
                <td>{ex.fechaProgramada.toLocaleDateString("es-MX")}</td>
                <td className="r">
                  <Money valor={Number(ex.monto)} />
                </td>
                <td className="r text-muted">
                  {ex.pago ? <Money valor={Number(ex.pago.montoComision)} conCentavos /> : "—"}
                </td>
                <td className="r">
                  {ex.estado === EstadoExhibicion.PAGADA ? (
                    <span className="chip ok">Pagada</span>
                  ) : ex.estado === EstadoExhibicion.VENCIDA ? (
                    <span className="chip late">Vencida</span>
                  ) : (
                    <span className="chip wait">Programada</span>
                  )}
                </td>
                <td className="font-mono text-[11px] text-muted">
                  {ex.pago?.referenciaStripe ?? "—"}
                </td>
                <td className="r">
                  {siguiente?.id === ex.id && plan.estado !== EstadoPlan.LIQUIDADO && (
                    ex.numero === 0 && stripeTestConfigurado ? (
                      <CobrarConStripe
                        exhibicionId={ex.id}
                        esAnticipo
                        bloqueado={!contrato}
                        stripeTestConfigurado
                        bloqueoCobro="Pendiente de backend: guardar la tarjeta y el consentimiento para las mensualidades con uso off_session."
                      />
                    ) : (
                      <CobrarButton
                        exhibicionId={ex.id}
                        esAnticipo={ex.numero === 0}
                        bloqueado={ex.numero === 0 && !contrato}
                      />
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {congelado && plan.estado === EstadoPlan.ACTIVO && (
        <AccionesPlan
          planId={plan.id}
          saldo={Number(plan.saldo)}
          paquetesMayores={paquetesMayores}
          bloqueoUpgrade={
            bloqueoPorLevantamiento(unidad.estadoOperativo, "el paquete") ??
            (plan.modalidad !== ModalidadPlan.PAQUETE
              ? "El upgrade es de un paquete cerrado a otro mayor; este plan se armó partida por partida."
              : null)
          }
        />
      )}

      {versiones.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <p className="label">Versiones del plan</p>
            <p className="mt-1.5 max-w-[70ch] text-[13px] text-ink-2">
              Recalcular versiona, no sobrescribe (R4): cada versión guarda la foto de su calendario
              al momento de crearse (el adelanto aparece por cobrar porque se cobra justo después). Lo
              cobrado no cambia entre versiones (R3); el estado actual está en la tabla de arriba.
            </p>
          </div>
          {versiones.map((v) => (
            <details key={v.id} className="card p-5" open={v.version === plan.version}>
              <summary className="cursor-pointer text-[14px]">
                <b>Versión {v.version}</b>
                {v.version === plan.version ? " · vigente" : ""} ·{" "}
                <span className="text-ink-2">{v.motivo}</span>{" "}
                <span className="text-muted">({v.createdAt.toLocaleDateString("es-MX")})</span>
              </summary>
              <table className="tbl mt-3">
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th>Fecha</th>
                    <th className="r">Monto</th>
                    <th className="r">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {v.calendario.map((f, i) => (
                    <tr key={i}>
                      <td>{conceptoExhibicion(f.numero, f.tipo)}</td>
                      <td>{new Date(f.fechaProgramada).toLocaleDateString("es-MX")}</td>
                      <td className="r">
                        <Money valor={Number(f.monto)} />
                      </td>
                      <td className="r text-muted">{f.estado === "PAGADA" ? "Pagada" : f.estado === "VENCIDA" ? "Vencida" : "Por cobrar"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))}
        </section>
      )}

      <EstadoFinancieroForm unidadId={unidad.id} estado={unidad.estadoFinanciero} />

      {plan.estado !== EstadoPlan.CANCELADO && (
        <ObraYEntrega
          unidadId={unidad.id}
          financiero={unidad.estadoFinanciero}
          operativo={unidad.estadoOperativo}
          instalacion={unidad.estadoInstalacion}
          partidasSinAcabado={renglones
            .filter((r) => Array.isArray(r.partida.acabados) && r.partida.acabados.length > 0 && !r.acabado)
            .map((r) => r.partida.nombre)}
          acta={
            unidad.actaEntrega
              ? {
                  quienFirmo: unidad.actaEntrega.quienFirmo,
                  fecha: unidad.actaEntrega.fechaFirma.toLocaleDateString("es-MX"),
                  archivo: unidad.actaEntrega.archivoNombre,
                }
              : null
          }
        />
      )}

      <div className="flex flex-col gap-3">
        <p className="label">Bitácora</p>
        <div className="card divide-y divide-line">
          {eventos.map((e) => (
            <div key={e.id} className="flex gap-4 p-4 text-[13.5px]">
              <span className="shrink-0 font-mono text-[11.5px] text-muted">
                {e.fecha.toLocaleString("es-MX", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="text-ink-2">{e.comentario}</span>
            </div>
          ))}
        </div>
        <p className="text-[12.5px] text-muted">
          La bitácora no se edita ni se borra. Es lo que sostiene una aclaración con el comprador.
        </p>
      </div>
    </div>
  );
}
