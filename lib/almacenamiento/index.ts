import path from "node:path";
import type { Almacenamiento } from "./contrato";
import { crearAlmacenLocal } from "./local";

/**
 * Único lugar donde se decide dónde se guardan los archivos. Para cambiar
 * de proveedor se escribe otra implementación de `Almacenamiento` y se
 * cambia esta línea; el motor no se toca (S1-05, D-12).
 *
 * ALMACEN_LOCAL_DIR permite apuntar a otra carpeta; por defecto, `almacen/`
 * en la raíz del proyecto (está en .gitignore).
 */
export const almacenamiento: Almacenamiento = crearAlmacenLocal(
  process.env.ALMACEN_LOCAL_DIR ?? path.join(process.cwd(), "almacen")
);

export type { Almacenamiento } from "./contrato";
