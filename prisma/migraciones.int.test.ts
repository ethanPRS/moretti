import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { cotizar, contenidoComoCanasta, type PartidaCotizable } from "@/lib/motor/canasta";
import {
  CATALOGO,
  PARTIDAS,
  PAQUETES_CERRADOS,
  contenidoPaquete,
  listaDePrecios,
  precioCocinaDerivado,
} from "./catalogo";

/**
 * La migración del 27 de septiembre (renglones del plan, S1-02) contra una
 * base que está como estaba el 25: prisma/pruebas/estado-20260925.sql es un
 * volcado de la base de desarrollo de ese día, con el plan DU-001.
 *
 * Usa su propia base (…_migracion_pruebas) porque necesita el esquema viejo.
 * Necesita psql, createdb y dropdb; si no están, la prueba se salta.
 */
const hayPsql = spawnSync("psql", ["--version"]).status === 0;
const FIXTURE = "prisma/pruebas/estado-20260925.sql";

function urlMigracion() {
  const url = new URL(process.env.DATABASE_URL!);
  const nombre = url.pathname.slice(1).replace(/_(pruebas|test)$/, "");
  url.pathname = `/${nombre}_migracion_pruebas`;
  return url;
}

function sh(cmd: string, args: string[], env?: Record<string, string>) {
  return execFileSync(cmd, args, { stdio: "pipe", env: { ...process.env, ...env } }).toString();
}

/** Base nueva con el volcado del 25, más `sqlExtra` antes de migrar. */
function prepararBaseVieja(sqlExtra = "") {
  const url = urlMigracion();
  const base = url.pathname.slice(1);
  const conexion = ["-h", url.hostname, "-p", url.port || "5432", ...(url.username ? ["-U", url.username] : [])];
  sh("dropdb", [...conexion, "--if-exists", base]);
  sh("createdb", [...conexion, base]);
  sh("psql", [...conexion, "-q", "-v", "ON_ERROR_STOP=1", "-d", base, "-f", FIXTURE]);
  if (sqlExtra) sh("psql", [...conexion, "-q", "-v", "ON_ERROR_STOP=1", "-d", base, "-c", sqlExtra]);
  return url.toString();
}

function migrar(url: string) {
  return spawnSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
  });
}

/**
 * Un plan (en el esquema viejo) por cada prototipo × paquete cerrado, además
 * del DU-001 que trae el volcado: 52 planes para comparar SQL contra TypeScript.
 */
const PLANES_EXTRA = `
CREATE TEMP TABLE combos AS
SELECT pr."id" AS precio_id, pr."prototipoId", pr."paqueteId", pr."monto", proto."proyectoId",
       ROW_NUMBER() OVER (ORDER BY pr."id") AS n
FROM "Precio" pr JOIN "Prototipo" proto ON proto."id" = pr."prototipoId"
WHERE pr."vigenteHasta" IS NULL;
INSERT INTO "Unidad" ("id", "proyectoId", "torre", "numero", "prototipoId")
  SELECT 'u' || n, "proyectoId", 'MIG', n::text, "prototipoId" FROM combos;
INSERT INTO "Comprador" ("id", "nombre", "contacto", "unidadId", "folio")
  SELECT 'c' || n, 'Migración ' || n, '-', 'u' || n, 'MIG-' || n FROM combos;
INSERT INTO "Plan" ("id", "compradorId", "paqueteId", "precioId", "montoCongelado", "saldo")
  SELECT 'p' || n, 'c' || n, "paqueteId", precio_id, "monto", "monto" FROM combos;
`;

/** Lo que `cotizar` dice que deben ser los renglones de un paquete cerrado. */
function esperado(clavePrototipo: string, slug: (typeof PAQUETES_CERRADOS)[number]) {
  const proto = Object.values(CATALOGO).flat().find((p) => p.clave === clavePrototipo)!;
  const lista = listaDePrecios(proto);
  const partidas: PartidaCotizable[] = PARTIDAS.map((p) => ({
    clave: p.clave,
    nombre: p.nombre,
    familia: p.familia,
    armable: p.armable,
    porEquipo: p.porEquipo,
    porDefecto: p.porDefecto,
    orden: p.orden,
    precioLista: lista[p.clave] ?? null,
  }));
  const i = PAQUETES_CERRADOS.indexOf(slug);
  const paquete = { id: slug, nombre: slug, precio: proto.precios[i], contenido: contenidoPaquete(slug, proto.climas) };
  return cotizar({ partidas, paquete, canasta: contenidoComoCanasta(paquete) }).renglones.map((r) => ({
    clave: r.clave,
    cantidad: r.cantidad,
    precioLista: r.precioLista,
    precioCongelado: r.importe,
  }));
}

describe.skipIf(!hayPsql)("migración 20260927 · renglones del plan (S1-02)", () => {
  let db: PrismaClient;

  beforeAll(() => {
    const url = prepararBaseVieja(PLANES_EXTRA);
    const resultado = migrar(url);
    if (resultado.status !== 0) throw new Error(resultado.stdout + resultado.stderr);
    db = new PrismaClient({ datasourceUrl: url });
  }, 120_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  async function renglones(planId: string) {
    const rs = await db.renglonPlan.findMany({ where: { planId }, include: { partida: true } });
    return rs
      .sort((a, b) => a.partida.orden - b.partida.orden)
      .map((r) => ({
        clave: r.partida.clave,
        cantidad: r.cantidad,
        precioLista: Number(r.precioLista),
        precioCongelado: Number(r.precioCongelado),
      }));
  }

  it("el plan de ejemplo DU-001 (Confort) se migra y conserva sus $176,200", async () => {
    const du001 = await db.plan.findFirstOrThrow({ where: { comprador: { folio: "DU-001" } } });

    expect(Number(du001.montoCongelado)).toBe(176200);
    expect(du001.modalidad).toBe("PAQUETE");
    expect(await renglones(du001.id)).toEqual([
      { clave: "cocina", cantidad: 1, precioLista: 78000, precioCongelado: 77912 },
      { clave: "closets", cantidad: 1, precioLista: 54600, precioCongelado: 54538 },
      { clave: "carp", cantidad: 1, precioLista: 14700, precioCongelado: 14683 },
      { clave: "clima", cantidad: 3, precioLista: 9700, precioCongelado: 29067 },
    ]);
    // Lo ya cobrado no se toca (R3): anticipo y dos mensualidades.
    expect(await db.pago.count({ where: { planId: du001.id } })).toBe(3);
  });

  it("la migración en SQL reparte igual que `cotizar` en TypeScript, en los 52 paquetes cerrados", async () => {
    const planes = await db.plan.findMany({
      where: { comprador: { folio: { startsWith: "MIG-" } } },
      include: { paquete: true, comprador: { include: { unidad: { include: { prototipo: true } } } } },
    });
    expect(planes).toHaveLength(52);
    for (const plan of planes) {
      const slug = plan.paquete.slug as (typeof PAQUETES_CERRADOS)[number];
      expect(await renglones(plan.id)).toEqual(esperado(plan.comprador.unidad.prototipo.clave, slug));
    }
  });

  it("agrega el precio de lista derivado de la cocina en los 13 prototipos (D-04)", async () => {
    const cocina = await db.precioPartida.findMany({
      where: { partida: { clave: "cocina" } },
      include: { prototipo: true },
    });
    expect(cocina).toHaveLength(13);
    for (const precio of cocina) {
      const proto = Object.values(CATALOGO).flat().find((p) => p.clave === precio.prototipo.clave)!;
      expect(Number(precio.monto)).toBe(precioCocinaDerivado(proto));
    }
  });

  it("deja un evento en la bitácora por cada plan migrado, y el mínimo por proyecto en $50,000", async () => {
    expect(await db.evento.count({ where: { tipo: "plan_migrado_a_renglones" } })).toBe(53);
    const proyectos = await db.proyecto.findMany();
    expect(proyectos.map((p) => Number(p.minimoPlan))).toEqual([50000, 50000]);
  });
});

describe.skipIf(!hayPsql)("migración 20260927 · si falta un precio de lista", () => {
  it("se detiene, dice qué falta y no deja nada a medias", async () => {
    const url = prepararBaseVieja(`
      DELETE FROM "PrecioPartida"
      WHERE "partidaId" = (SELECT "id" FROM "Partida" WHERE "clave" = 'closets')
        AND "prototipoId" = (SELECT "prototipoId" FROM "Unidad" WHERE "numero" = '717');`);

    const resultado = migrar(url);
    expect(resultado.status).not.toBe(0);
    expect(resultado.stdout + resultado.stderr).toContain(
      "falta el precio de lista de: DEPA 2R (tipo 717) · closets, DEPA 2R (tipo 717) · cocina"
    );

    const db = new PrismaClient({ datasourceUrl: url });
    try {
      const [{ existe }] = await db.$queryRaw<{ existe: boolean }[]>`
        SELECT to_regclass('"RenglonPlan"') IS NOT NULL AS existe`;
      expect(existe).toBe(false);
    } finally {
      await db.$disconnect();
    }
  }, 120_000);
});
