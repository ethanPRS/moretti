"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ContenidoBoton } from "@/components/Boton";

const LIGAS = [
  { href: "#instalado", texto: "Qué incluye" },
  { href: "#como", texto: "Cómo se paga" },
  { href: "#paquetes", texto: "Paquetes" },
];

export default function Encabezado() {
  const [solido, setSolido] = useState(false);
  const [oscuro, setOscuro] = useState(false);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    // Tinta sobre el yeso, clara sobre la foto ya descubierta y sólido al
    // salir del hero (que mide 280vh y se queda fijo 180vh).
    const revisar = () => {
      const y = window.scrollY;
      const alto = window.innerHeight;
      setOscuro(y > alto * 0.45 && y < alto * 1.75);
      setSolido(y >= alto * 1.75);
    };
    revisar();
    window.addEventListener("scroll", revisar, { passive: true });
    return () => window.removeEventListener("scroll", revisar);
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [abierto]);

  return (
    <header
      className="ld-header"
      data-solido={solido || abierto ? "" : undefined}
      data-oscuro={oscuro && !abierto ? "" : undefined}
    >
      <nav className="mx-auto flex max-w-[1240px] items-center justify-between gap-6 px-5 py-4 sm:px-8">
        <Link href="/landing" className="leading-none" onClick={() => setAbierto(false)}>
          <span className="font-display text-[21px] font-bold tracking-[-0.015em]">día uno</span>
          <span className="mt-0.5 block text-[10.5px] uppercase tracking-[0.14em] opacity-70">
            con Moretti
          </span>
        </Link>

        <div className="hidden items-center gap-8 text-[15px] md:flex">
          {LIGAS.map((l) => (
            <a key={l.href} href={l.href} className="ld-liga">
              <span data-text={l.texto}>{l.texto}</span>
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link href="/#cotiza" className="btn btn-sm hidden sm:inline-flex">
            <ContenidoBoton texto="Cotizar mi depa" />
          </Link>
          <button
            type="button"
            className="ld-burger md:hidden"
            aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={abierto}
            aria-controls="ld-menu"
            onClick={() => setAbierto((a) => !a)}
          >
            <span />
            <span />
          </button>
        </div>
      </nav>

      <div id="ld-menu" className="ld-menu md:hidden" data-abierto={abierto ? "" : undefined} hidden={!abierto}>
        <ul>
          {LIGAS.map((l, i) => (
            <li key={l.href} className="ld-palabra">
              <a
                href={l.href}
                style={{ "--i": i } as React.CSSProperties}
                onClick={() => setAbierto(false)}
              >
                {l.texto}
              </a>
            </li>
          ))}
        </ul>
        <Link href="/#cotiza" className="btn mt-8 self-start" onClick={() => setAbierto(false)}>
          <ContenidoBoton texto="Cotizar mi depa" flecha />
        </Link>
      </div>
    </header>
  );
}
