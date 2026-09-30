"use client";

import { useEffect, useRef, useState } from "react";

/** Marca `data-visto` la primera vez que el bloque entra en pantalla. */
export default function AlVer({
  children,
  className,
  como: Etiqueta = "div",
}: {
  children: React.ReactNode;
  className?: string;
  como?: "div" | "h2" | "p";
}) {
  const ref = useRef<HTMLElement>(null);
  const [visto, setVisto] = useState(false);

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo || typeof IntersectionObserver === "undefined") {
      setVisto(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting || e.boundingClientRect.top < 0) {
          setVisto(true);
          obs.disconnect();
        }
      },
      { rootMargin: "0px 0px -15% 0px" }
    );
    obs.observe(nodo);
    return () => obs.disconnect();
  }, []);

  return (
    // @ts-expect-error el ref genérico sirve para las tres etiquetas
    <Etiqueta ref={ref} className={className} data-visto={visto ? "" : undefined}>
      {children}
    </Etiqueta>
  );
}

/** Cada palabra sube desde abajo de su propia máscara, una tras otra. */
export function Palabras({ texto, desde = 0 }: { texto: string; desde?: number }) {
  return (
    <span aria-label={texto} className="ld-palabras">
      {texto.split(" ").map((palabra, i) => (
        <span key={i} aria-hidden="true" className="ld-palabra">
          <span style={{ "--i": desde + i } as React.CSSProperties}>{palabra}</span>
        </span>
      ))}
    </span>
  );
}
