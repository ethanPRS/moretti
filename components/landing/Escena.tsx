"use client";

import { useEffect, useRef } from "react";

/**
 * Publica en `--p` (de 0 a 1) cuánto se ha recorrido la escena con el scroll,
 * sin volver a renderizar: el CSS hace el resto con calc().
 *
 * - `fija`: la escena es más alta que la pantalla y su interior es sticky;
 *   0 cuando su borde de arriba toca el de la pantalla, 1 cuando termina.
 * - `paso`: 0 cuando asoma por abajo, 1 cuando su centro llega al centro.
 *
 * Con movimiento reducido no escucha el scroll: el CSS fija `--p: 1`.
 */
export default function Escena({
  modo = "paso",
  className,
  children,
  id,
}: {
  modo?: "fija" | "paso";
  className?: string;
  children: React.ReactNode;
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cuadro = 0;
    const medir = () => {
      cuadro = 0;
      const caja = nodo.getBoundingClientRect();
      const alto = window.innerHeight;
      const p =
        modo === "fija"
          ? -caja.top / Math.max(1, caja.height - alto)
          : (alto - caja.top) / (alto / 2 + caja.height / 2);
      nodo.style.setProperty("--p", Math.min(1, Math.max(0, p)).toFixed(4));
    };
    const pedir = () => {
      if (!cuadro) cuadro = requestAnimationFrame(medir);
    };

    medir();
    window.addEventListener("scroll", pedir, { passive: true });
    window.addEventListener("resize", pedir);
    return () => {
      cancelAnimationFrame(cuadro);
      window.removeEventListener("scroll", pedir);
      window.removeEventListener("resize", pedir);
    };
  }, [modo]);

  return (
    <section ref={ref} id={id} className={`ld-escena ${className ?? ""}`}>
      {children}
    </section>
  );
}
