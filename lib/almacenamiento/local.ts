import { mkdir, readFile, rm, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { validarClave, type Almacenamiento } from "./contrato";

/**
 * Almacenamiento en una carpeta del disco. Para el prototipo y las pruebas:
 * en un despliegue sin disco persistente las fotos se perderían (riesgo 6 del
 * plan del sprint), por eso hay que elegir proveedor antes de producción.
 *
 * La carpeta queda fuera de `public/`: las fotos no son estáticas, se sirven
 * por /api/fotos/<id>.
 */
export function crearAlmacenLocal(carpeta: string): Almacenamiento {
  const raiz = path.resolve(carpeta);

  function ruta(clave: string) {
    const destino = path.resolve(raiz, validarClave(clave));
    // Doble candado: aunque la clave pasara la validación, nunca fuera de la raíz.
    if (!destino.startsWith(raiz + path.sep)) throw new Error(`Clave fuera del almacén: ${clave}`);
    return destino;
  }

  return {
    async guardar(clave, contenido) {
      const destino = ruta(clave);
      await mkdir(path.dirname(destino), { recursive: true });
      // Se escribe a un temporal y se renombra: nadie lee una foto a medias.
      const temporal = `${destino}.${process.pid}.tmp`;
      await writeFile(temporal, contenido);
      await rename(temporal, destino);
    },

    async leer(clave) {
      try {
        return new Uint8Array(await readFile(ruta(clave)));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },

    async borrar(clave) {
      await rm(ruta(clave), { force: true });
    },
  };
}
