import { describe, expect, it } from "vitest";
import { MAX_BYTES_FOTO, tipoDeFoto, validarFoto } from "./fotos";
import { ReglaError } from "./errores";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
// Una HEIC de iPhone empieza con una caja «ftyp».
const heic = Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);

function deTamano(bytes: number, cabeza: Uint8Array) {
  const contenido = new Uint8Array(bytes);
  contenido.set(cabeza);
  return contenido;
}

describe("S1-05 · qué foto de referencia se acepta", () => {
  it("reconoce JPG y PNG por su contenido", () => {
    expect(tipoDeFoto(jpg)).toBe("image/jpeg");
    expect(tipoDeFoto(png)).toBe("image/png");
    expect(tipoDeFoto(heic)).toBeNull();
  });

  it("acepta JPG y PNG de hasta 5 MB exactos", () => {
    expect(validarFoto({ nombre: "cocina.jpg", contenido: jpg })).toBe("image/jpeg");
    expect(validarFoto({ nombre: "muro.png", contenido: deTamano(MAX_BYTES_FOTO, png) })).toBe("image/png");
  });

  it("rechaza lo que pasa de 5 MB, diciendo cuánto pesa", () => {
    expect(() => validarFoto({ nombre: "grande.jpg", contenido: deTamano(MAX_BYTES_FOTO + 1, jpg) })).toThrowError(
      "«grande.jpg» pesa 5.0 MB y el máximo es 5 MB por foto. Redúcela y vuelve a subirla."
    );
    expect(() =>
      validarFoto({ nombre: "enorme.jpg", contenido: deTamano(7.5 * 1024 * 1024, jpg) })
    ).toThrowError(/pesa 7.5 MB/);
  });

  it("no se deja engañar por la extensión: una HEIC renombrada a .jpg no pasa", () => {
    expect(() => validarFoto({ nombre: "IMG_0042.jpg", contenido: heic })).toThrowError(ReglaError);
    expect(() => validarFoto({ nombre: "IMG_0042.jpg", contenido: heic })).toThrowError(/expórtala como JPG/);
  });

  it("rechaza un archivo vacío", () => {
    expect(() => validarFoto({ nombre: "nada.jpg", contenido: new Uint8Array() })).toThrowError(/vacío/);
  });
});
