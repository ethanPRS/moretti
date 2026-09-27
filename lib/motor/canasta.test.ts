import { describe, it, expect } from "vitest";
import {
  cotizar,
  contenidoComoCanasta,
  canastaInicialArmaElTuyo,
  avisoPerdidaPaquete,
  mensajeDebajoDelMinimo,
  esFinanciable,
  type PartidaCotizable,
  type PaqueteCotizable,
  type Canasta,
} from "./canasta";
import { ReglaError } from "./errores";
import {
  CATALOGO,
  PARTIDAS,
  PAQUETES_CERRADOS,
  contenidoPaquete,
  listaDePrecios,
  precioCocinaDerivado,
} from "../../prisma/catalogo";

type Proto = (typeof CATALOGO)[string][number];

/** El catálogo de un prototipo tal como lo entrega la base, pero desde prisma/catalogo.ts. */
function catalogoDe(proto: Proto) {
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
  const paquetes: PaqueteCotizable[] = PAQUETES_CERRADOS.map((slug, i) => ({
    id: slug,
    nombre: slug,
    precio: proto.precios[i],
    contenido: contenidoPaquete(slug, proto.climas),
  }));
  return { partidas, paquetes, lista };
}

const todos = Object.values(CATALOGO).flat();
const depa2R = CATALOGO["Barrio Roble"][0];
const { partidas: partidas2R, paquetes: paquetes2R } = catalogoDe(depa2R);
const confort2R = paquetes2R[1];
const plus2R = paquetes2R[2];

const sumaImportes = (c: ReturnType<typeof cotizar>) =>
  c.renglones.reduce((acc, r) => acc + r.importe, 0);

describe("catálogo: precio de lista de la cocina (derivado, D-04)", () => {
  it("sale positivo y múltiplo de $100 en los 13 prototipos", () => {
    expect(todos).toHaveLength(13);
    for (const proto of todos) {
      const cocina = precioCocinaDerivado(proto);
      expect(cocina).toBeGreaterThan(0);
      expect(cocina % 100).toBe(0);
    }
  });

  it("Casa Lista cuesta exactamente sus tres partidas a lista (así se derivó)", () => {
    for (const proto of todos) {
      const { paquetes, lista } = catalogoDe(proto);
      const casaLista = paquetes[0];
      const suma = Object.entries(casaLista.contenido).reduce(
        (acc, [clave, cantidad]) => acc + lista[clave] * cantidad,
        0
      );
      expect(suma).toBe(casaLista.precio);
    }
  });
});

describe("S1-02 · plan sobre lista de partidas (R7)", () => {
  it("un paquete cerrado sin cambios cuesta su precio de conjunto, en los 52 casos", () => {
    let casos = 0;
    for (const proto of todos) {
      const { partidas, paquetes } = catalogoDe(proto);
      for (const paquete of paquetes) {
        const c = cotizar({ partidas, paquete, canasta: contenidoComoCanasta(paquete) });
        expect(c.modalidad).toBe("PAQUETE");
        expect(c.total).toBe(paquete.precio);
        // R7: la suma de los renglones cuadra al peso con el total.
        expect(sumaImportes(c)).toBe(paquete.precio);
        expect(c.renglones.every((r) => Number.isInteger(r.importe) && r.importe > 0)).toBe(true);
        expect(c.renglones.every((r) => r.origen === "PAQUETE")).toBe(true);
        expect(c.perdidaPaquete).toBeNull();
        casos++;
      }
    }
    expect(casos).toBe(52);
  });

  it("reparte el precio de Confort en el DEPA 2R (el plan DU-001) partida por partida", () => {
    const c = cotizar({ partidas: partidas2R, paquete: confort2R, canasta: contenidoComoCanasta(confort2R) });

    // Pesos a lista: cocina 78,000 · clósets 54,600 · carpintería 14,700 · 3 climas 29,100
    // = 176,400. El paquete cuesta 176,200: cada renglón se lleva su parte y el
    // último (el clima, por orden de catálogo) absorbe el redondeo.
    expect(c.renglones.map((r) => [r.clave, r.cantidad, r.precioLista, r.importe])).toEqual([
      ["cocina", 1, 78000, 77912],
      ["closets", 1, 54600, 54538],
      ["carp", 1, 14700, 14683],
      ["clima", 3, 9700, 29067],
    ]);
    expect(sumaImportes(c)).toBe(176200);
  });

  it("el renglón guarda el precio de lista por pieza, no por renglón", () => {
    const c = cotizar({ partidas: partidas2R, paquete: confort2R, canasta: contenidoComoCanasta(confort2R) });
    const clima = c.renglones.find((r) => r.clave === "clima")!;
    expect(clima.cantidad).toBe(3);
    expect(clima.precioLista).toBe(9700);
  });

  it("el reparto no depende del orden en que llegue la canasta", () => {
    const alReves: Canasta = Object.fromEntries(
      Object.entries(contenidoComoCanasta(confort2R)).reverse()
    );
    const a = cotizar({ partidas: partidas2R, paquete: confort2R, canasta: contenidoComoCanasta(confort2R) });
    const b = cotizar({ partidas: partidas2R, paquete: confort2R, canasta: alReves });
    expect(b.renglones).toEqual(a.renglones);
  });
});

describe("S1-03 · las tres reglas de armado", () => {
  it("agregar una partida a un paquete cerrado suma su precio de lista y conserva el de conjunto", () => {
    const c = cotizar({
      partidas: partidas2R,
      paquete: confort2R,
      canasta: { ...contenidoComoCanasta(confort2R), panel: 1 },
    });
    expect(c.modalidad).toBe("PAQUETE");
    expect(c.total).toBe(176200 + 8500);
    expect(sumaImportes(c)).toBe(c.total);

    const panel = c.renglones.find((r) => r.clave === "panel")!;
    expect(panel).toMatchObject({ origen: "AGREGADA", cantidad: 1, precioLista: 8500, importe: 8500 });
    const delPaquete = c.renglones.filter((r) => r.origen === "PAQUETE");
    expect(delPaquete.reduce((a, r) => a + r.importe, 0)).toBe(176200);
  });

  it("un clima de más se agrega a lista, en su propio renglón", () => {
    const c = cotizar({
      partidas: partidas2R,
      paquete: confort2R,
      canasta: { ...contenidoComoCanasta(confort2R), clima: 4 },
    });
    expect(c.modalidad).toBe("PAQUETE");
    expect(c.total).toBe(176200 + 9700);
    const climas = c.renglones.filter((r) => r.clave === "clima");
    expect(climas.map((r) => [r.origen, r.cantidad])).toEqual([
      ["PAQUETE", 3],
      ["AGREGADA", 1],
    ]);
    expect(climas[1].importe).toBe(9700);
  });

  it("quitar una partida deshace el paquete: todo lo que queda va a precio de lista", () => {
    const canasta = { ...contenidoComoCanasta(confort2R), clima: 0 };
    const c = cotizar({ partidas: partidas2R, paquete: confort2R, canasta });

    expect(c.modalidad).toBe("A_LISTA");
    expect(c.total).toBe(78000 + 54600 + 14700);
    expect(c.renglones.every((r) => r.importe === r.precioLista * r.cantidad)).toBe(true);
    expect(c.perdidaPaquete).toEqual({
      paquete: "confort",
      quitadas: ["Clima minisplit"],
      // Confort a lista suma 176,400 y cuesta 176,200: se pierden $200.
      diferencia: 200,
    });
  });

  it("bajar la cantidad de climas del paquete también cuenta como quitar", () => {
    const c = cotizar({
      partidas: partidas2R,
      paquete: confort2R,
      canasta: { ...contenidoComoCanasta(confort2R), clima: 2 },
    });
    expect(c.modalidad).toBe("A_LISTA");
    expect(c.total).toBe(78000 + 54600 + 14700 + 2 * 9700);
    expect(c.perdidaPaquete?.quitadas).toEqual(["Clima minisplit (1 de 3)"]);
  });

  it("quitar y agregar a la vez: todo a lista, incluida la agregada", () => {
    const c = cotizar({
      partidas: partidas2R,
      paquete: plus2R,
      canasta: { ...contenidoComoCanasta(plus2R), lavado: 0, tv: 1 },
    });
    expect(c.modalidad).toBe("A_LISTA");
    expect(c.total).toBe(78000 + 54600 + 14700 + 3 * 9700 + 8500 + 46500);
    expect(c.renglones.find((r) => r.clave === "tv")?.origen).toBe("AGREGADA");
    expect(sumaImportes(c)).toBe(c.total);
  });

  it("en los 13 prototipos, quitar cualquier partida cobra lo demás a lista y avisa la diferencia exacta", () => {
    let casos = 0;
    for (const proto of todos) {
      const { partidas, paquetes, lista } = catalogoDe(proto);
      for (const paquete of paquetes) {
        const aLista = Object.entries(paquete.contenido).reduce(
          (acc, [clave, cantidad]) => acc + lista[clave] * cantidad,
          0
        );
        for (const quitada of Object.keys(paquete.contenido)) {
          const canasta = { ...contenidoComoCanasta(paquete), [quitada]: 0 };
          const c = cotizar({ partidas, paquete, canasta });
          const restante = Object.entries(canasta).reduce(
            (acc, [clave, cantidad]) => acc + lista[clave] * cantidad,
            0
          );
          expect(c.modalidad).toBe("A_LISTA");
          expect(c.total).toBe(restante);
          expect(sumaImportes(c)).toBe(c.total);
          // Lo que se paga de más contra «el paquete menos lo quitado» es
          // justo el descuento de conjunto que se pierde.
          expect(c.perdidaPaquete?.diferencia).toBe(aLista - paquete.precio);
          expect(c.total - (paquete.precio - lista[quitada] * paquete.contenido[quitada])).toBe(
            aLista - paquete.precio
          );
          casos++;
        }
      }
    }
    // 13 prototipos × (3 + 4 + 6 + 11) partidas que se pueden quitar.
    expect(casos).toBe(13 * (3 + 4 + 6 + 11));
  });

  it("una canasta desde cero se cotiza como «Arma el tuyo», a lista pieza por pieza", () => {
    const c = cotizar({
      partidas: partidas2R,
      paquete: null,
      canasta: { closets: 1, carp: 1, clima: 2, tv: 1 },
    });
    expect(c.modalidad).toBe("ARMA_EL_TUYO");
    expect(c.total).toBe(54600 + 14700 + 2 * 9700 + 46500);
    expect(c.renglones.every((r) => r.origen === "AGREGADA")).toBe(true);
    expect(c.perdidaPaquete).toBeNull();
  });

  it("da el mismo total que el cotizador del sitio en todas las canastas de «Arma el tuyo»", () => {
    const armables = PARTIDAS.filter((p) => p.armable && !p.porEquipo);
    let casos = 0;
    for (const proto of todos) {
      const { partidas } = catalogoDe(proto);
      for (let mascara = 1; mascara < 1 << armables.length; mascara++) {
        const canasta: Canasta = { clima: proto.climas };
        let esperado = proto.climas * proto.partidas.clima;
        armables.forEach((p, i) => {
          if (mascara & (1 << i)) {
            canasta[p.clave] = 1;
            esperado += proto.partidas[p.clave];
          }
        });
        expect(cotizar({ partidas, paquete: null, canasta }).total).toBe(esperado);
        casos++;
      }
    }
    expect(casos).toBe(13 * 511);
  });
});

describe("S1-03 · lo que no se permite, con mensaje que dice por qué", () => {
  const armar = (canasta: Canasta, paquete: PaqueteCotizable | null = null) =>
    () => cotizar({ partidas: partidas2R, paquete, canasta });

  it("la cocina no entra en «Arma el tuyo»", () => {
    expect(armar({ cocina: 1, closets: 1 })).toThrowError(ReglaError);
    expect(armar({ cocina: 1, closets: 1 })).toThrowError(/paquete cerrado/);
  });

  it("sólo los climas llevan cantidad", () => {
    expect(armar({ closets: 2 })).toThrowError(/una sola vez/);
  });

  it("cantidades negativas, con decimales o de más no pasan", () => {
    expect(armar({ clima: -1 })).toThrowError(/no es válida/);
    expect(armar({ clima: 1.5 })).toThrowError(/no es válida/);
    expect(armar({ clima: 10 })).toThrowError(/hasta 9/);
  });

  it("una partida que no está en el catálogo", () => {
    expect(armar({ jacuzzi: 1 })).toThrowError(/no está en el catálogo/);
  });

  it("una canasta vacía", () => {
    expect(armar({})).toThrowError(/vacía/);
    expect(armar({ closets: 0, clima: 0 })).toThrowError(/vacía/);
  });

  it("una partida sin precio de lista en el prototipo", () => {
    const sinPrecio = partidas2R.map((p) => (p.clave === "tv" ? { ...p, precioLista: null } : p));
    expect(() => cotizar({ partidas: sinPrecio, paquete: null, canasta: { tv: 1 } })).toThrowError(
      /no tiene precio de lista/
    );
  });

  it("un paquete cuyo contenido no tiene precio de lista no se puede repartir", () => {
    const sinPrecio = partidas2R.map((p) => (p.clave === "cocina" ? { ...p, precioLista: null } : p));
    expect(() =>
      cotizar({ partidas: sinPrecio, paquete: confort2R, canasta: contenidoComoCanasta(confort2R) })
    ).toThrowError(/Cocina integral/);
  });
});

describe("levantamiento (spec §4)", () => {
  it("lo lleva la canasta con al menos una partida a la medida", () => {
    expect(cotizar({ partidas: partidas2R, paquete: null, canasta: { closets: 1 } }).llevaLevantamiento).toBe(true);
  });

  it("una canasta de puro catálogo no lo lleva", () => {
    expect(
      cotizar({ partidas: partidas2R, paquete: null, canasta: { clima: 3, tv: 1 } }).llevaLevantamiento
    ).toBe(false);
  });
});

describe("canasta inicial de «Arma el tuyo» (spec §4)", () => {
  it("arranca con clósets y carpintería marcados y los climas del prototipo, sin cocina", () => {
    const canasta = canastaInicialArmaElTuyo(partidas2R, 3);
    expect(canasta).toEqual({
      closets: 1,
      carp: 1,
      clima: 3,
      lavado: 0,
      panel: 0,
      tv: 0,
      estufa: 0,
      refri: 0,
      lava: 0,
      vale: 0,
    });
    expect(cotizar({ partidas: partidas2R, paquete: null, canasta }).total).toBe(54600 + 14700 + 3 * 9700);
  });
});

describe("mínimo para financiar (S1-03)", () => {
  it("financia desde el mínimo, no antes", () => {
    expect(esFinanciable(50000, 50000)).toBe(true);
    expect(esFinanciable(49999, 50000)).toBe(false);
  });

  it("el mensaje dice cuánto falta y que se paga de contado", () => {
    expect(mensajeDebajoDelMinimo(38300, 50000)).toBe(
      "El total ($38,300) no llega al mínimo para financiar de este proyecto ($50,000), así que no se genera plan a 12 meses: se paga de contado en un solo pago. Le faltan $11,700 para poder pagarlo en mensualidades."
    );
  });
});

describe("aviso al deshacer un paquete (S1-03)", () => {
  it("dice qué se quitó y cuánto de más se paga", () => {
    const c = cotizar({ partidas: partidas2R, paquete: { ...confort2R, nombre: "Confort" }, canasta: { ...contenidoComoCanasta(confort2R), clima: 0 } });
    expect(avisoPerdidaPaquete(c.perdidaPaquete!)).toBe(
      "Al quitar Clima minisplit, Confort deja de ser paquete: lo que queda se cobra a precio de lista. Pagas $200 más que el precio del paquete sin esa partida."
    );
  });

  it("cuando el paquete cuesta lo mismo que sus partidas, lo dice", () => {
    const casaLista = { ...paquetes2R[0], nombre: "Casa Lista" };
    const c = cotizar({ partidas: partidas2R, paquete: casaLista, canasta: { ...contenidoComoCanasta(casaLista), carp: 0 } });
    expect(avisoPerdidaPaquete(c.perdidaPaquete!)).toBe(
      "Al quitar Carpintería complementaria, Casa Lista deja de ser paquete: lo que queda se cobra a precio de lista. En este departamento no cambia el total: el paquete cuesta lo mismo que sus partidas por separado."
    );
  });
});
