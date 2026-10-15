import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { crearPasarelaFalsa } from "@/lib/pasarela/falsa";
import { avisarTarjetasPorVencer } from "./avisos-tarjeta";
import { resumenCobranza } from "./cobranza";
import { aFecha, diaEnMexico } from "./fiscal";
import { cobrarAnticipo, darDeAlta } from "./planes";
import { ultimoDiaDeLaTarjeta } from "./vencimiento-tarjeta";
import { baseLimpiaConCatalogo, eventosDelPlan, firmarContrato, paquete, unidadLibre } from "@/pruebas/utilidades";

const DIA = 24 * 60 * 60 * 1000;

/** La tarjeta vence el mes que entra: al plan le quedan casi todas sus mensualidades después. */
const hoy = diaEnMexico(new Date());
const MES = hoy.mes === 12 ? 1 : hoy.mes + 1;
const ANIO = hoy.mes === 12 ? hoy.anio + 1 : hoy.anio;
const ULTIMO = aFecha(ultimoDiaDeLaTarjeta(MES, ANIO)).getTime();
/** Mediodía UTC de N días antes (negativo: después) del último día de la tarjeta. */
const antes = (dias: number) => new Date(ULTIMO - dias * DIA);

async function planConTarjeta(nombre: string, extra: { tarjetaInvalida?: boolean } = {}) {
  const unidad = await unidadLibre("DEPA 2R (tipo 717)");
  const { plan, comprador } = await darDeAlta({ nombre, contacto: "81", unidadId: unidad.id, paqueteId: (await paquete("casa-lista")).id });
  await firmarContrato(unidad.id);
  await cobrarAnticipo(plan.id, { pasarela: crearPasarelaFalsa() });
  await prisma.comprador.update({
    where: { id: comprador.id },
    data: { tarjetaDescripcion: "visa terminación 4242", tarjetaVenceMes: MES, tarjetaVenceAnio: ANIO, ...extra },
  });
  return { planId: plan.id, compradorId: comprador.id };
}

const avisos = async (planId: string) =>
  (await eventosDelPlan(planId)).filter((e) => e.tipo === "tarjeta_por_vencer").map((e) => e.estadoNuevo);

beforeEach(baseLimpiaConCatalogo);

describe("E4 · avisos de tarjeta por vencer al back office", () => {
  it("un aviso al entrar a cada etapa (1 mes, 2 semanas, 1 semana, 3 días, vencida); repetir el barrido no duplica", async () => {
    const { planId } = await planConTarjeta("Por vencer");
    const llave = (e: string) => `${e} ${MES}/${ANIO}`;

    expect(await avisarTarjetasPorVencer(antes(31))).toEqual({ revisados: 1, avisados: 0 });
    expect((await avisarTarjetasPorVencer(antes(30))).avisados).toBe(1);
    expect((await avisarTarjetasPorVencer(antes(30))).avisados).toBe(0); // el cron corrió dos veces
    expect((await avisarTarjetasPorVencer(antes(20))).avisados).toBe(0); // sigue en la etapa de 1 mes
    expect((await avisarTarjetasPorVencer(antes(14))).avisados).toBe(1);
    expect((await avisarTarjetasPorVencer(antes(7))).avisados).toBe(1);
    expect((await avisarTarjetasPorVencer(antes(5))).avisados).toBe(0);
    expect((await avisarTarjetasPorVencer(antes(3))).avisados).toBe(1);
    expect((await avisarTarjetasPorVencer(antes(-1))).avisados).toBe(1);

    expect(await avisos(planId)).toEqual([llave("30d"), llave("14d"), llave("7d"), llave("3d"), llave("vencida")]);
    const primero = (await eventosDelPlan(planId)).find((e) => e.tipo === "tarjeta_por_vencer")!;
    expect(primero.comentario).toMatch(/^Tarjeta por vencer \(aviso de 1 mes\): La tarjeta visa terminación 4242 vence el .* \(faltan 30 días\); quedan \d+ cobros programados después/);
  });

  it("si el barrido no corrió unos días, avisa la etapa en la que va, no las que se saltó", async () => {
    const { planId } = await planConTarjeta("Sin barrido");
    await avisarTarjetasPorVencer(antes(5));
    expect(await avisos(planId)).toEqual([`7d ${MES}/${ANIO}`]);
  });

  it("dos barridos al mismo tiempo dejan un solo aviso", async () => {
    const { planId } = await planConTarjeta("Simultáneo");
    const [a, b] = await Promise.all([avisarTarjetasPorVencer(antes(30)), avisarTarjetasPorVencer(antes(30))]);
    expect(a.avisados + b.avisados).toBe(1);
    expect(await avisos(planId)).toHaveLength(1);
  });

  it("una tarjeta renovada empieza de cero; una inválida o sin cobros después no se avisa", async () => {
    const renovada = await planConTarjeta("Renovada");
    await avisarTarjetasPorVencer(antes(30));
    await prisma.comprador.update({ where: { id: renovada.compradorId }, data: { tarjetaVenceAnio: ANIO + 4 } });
    expect((await avisarTarjetasPorVencer(antes(14))).avisados).toBe(0);

    const invalida = await planConTarjeta("Inválida", { tarjetaInvalida: true });
    const sinCobros = await planConTarjeta("Sin cobros después");
    // Todo lo que le queda se cobra antes de que venza la tarjeta.
    await prisma.exhibicion.updateMany({
      where: { planId: sinCobros.planId, estado: "PENDIENTE" },
      data: { fechaProgramada: antes(40) },
    });
    await avisarTarjetasPorVencer(antes(14));
    expect(await avisos(invalida.planId)).toEqual([]);
    expect(await avisos(sinCobros.planId)).toEqual([]);
  });

  it("el tablero de cobranza la muestra desde un mes antes, con los días que faltan", async () => {
    await planConTarjeta("En el tablero");
    const tarjetas = async (cuando: Date) => (await resumenCobranza(cuando)).alertas.filter((a) => a.tipo === "tarjeta_por_vencer");

    expect(await tarjetas(antes(31))).toEqual([]);
    const [alerta] = await tarjetas(antes(10));
    expect(alerta).toMatchObject({ comprador: "En el tablero" });
    expect(alerta.texto).toMatch(/^La tarjeta visa terminación 4242 vence el .* \(faltan 10 días\); quedan \d+ cobros programados después\. Pídele al comprador que registre otra\.$/);
    expect((await tarjetas(antes(-2)))[0].texto).toMatch(/venció el/);
  });
});
