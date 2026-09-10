"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Revela su contenido cuando entra en pantalla. El estado oculto vive en CSS
 * detrás de `prefers-reduced-motion: no-preference`, así que quien pide menos
 * movimiento nunca lo ve escondido — y sin JS tampoco (ver el <noscript> del layout).
 */
export default function Reveal({
  children,
  delay = 0,
  className,
  as: Etiqueta = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "article" | "li";
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;

    if (typeof IntersectionObserver === "undefined") {
      nodo.classList.add("is-visible");
      return;
    }

    const observador = new IntersectionObserver(
      ([entrada]) => {
        // Lo que ya quedó arriba de la pantalla —por recarga a media página,
        // enlace directo a una sección o scroll muy rápido— se muestra de una
        // vez: si no, queda invisible al regresar hacia arriba.
        const yaPaso = entrada.boundingClientRect.top < 0;
        if (entrada.isIntersecting || yaPaso) {
          setVisible(true);
          observador.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
    );

    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  return (
    <Etiqueta
      // @ts-expect-error el ref genérico sirve para cualquiera de las etiquetas permitidas
      ref={ref}
      data-reveal=""
      className={visible ? `is-visible ${className ?? ""}` : className}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Etiqueta>
  );
}
