/**
 * Avisos emergentes del back office: cualquier componente de cliente llama
 * `avisar.exito("…")` o `avisar.error("…")` y <Avisos /> (en el layout del
 * panel) los muestra. Sin contexto de React: basta con importar.
 */
export type TipoAviso = "exito" | "error";
export type Aviso = { id: number; tipo: TipoAviso; texto: string };

const EVENTO = "dno:aviso";
let siguiente = 1;

function emitir(tipo: TipoAviso, texto: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Aviso>(EVENTO, { detail: { id: siguiente++, tipo, texto } }));
}

export const avisar = {
  exito: (texto: string) => emitir("exito", texto),
  error: (texto: string) => emitir("error", texto),
};

export function escucharAvisos(cb: (a: Aviso) => void) {
  const manejar = (e: Event) => cb((e as CustomEvent<Aviso>).detail);
  window.addEventListener(EVENTO, manejar);
  return () => window.removeEventListener(EVENTO, manejar);
}
