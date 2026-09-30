import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import Boton from "@/components/Boton";
import Escena from "@/components/landing/Escena";
import AlVer, { Palabras } from "@/components/landing/AlVer";
import Encabezado from "@/components/landing/Encabezado";
import "./landing.css";

export const metadata = {
  title: "día uno · tu depa listo el día que recibes llaves",
  // Versión en prueba: no la indexamos hasta que sea la oficial.
  robots: { index: false, follow: false },
};

/** Lo que se ve instalado en el render del hero, con su lugar en la foto. */
const PUNTOS = [
  { texto: "Clima", x: 15, y: 21 },
  { texto: "Mueble de TV y repisa", x: 30, y: 30 },
  { texto: "Cocina integral", x: 72, y: 46 },
];

const INSTALADO = [
  { img: "/productos/cocina.jpg", titulo: "Cocina integral", texto: "Gabinetes, cubierta y tarja a la medida de tu prototipo." },
  { img: "/productos/panel.jpg", titulo: "Clósets y paneles", texto: "Recámaras con clóset completo y muros con acabado." },
  { img: "/productos/tv.jpg", titulo: "Clima", texto: "Un equipo por espacio; tú decides cuántos." },
  { img: "/productos/clima.jpg", titulo: "Mueble de TV", texto: "La sala resuelta desde el primer día." },
];

/** El orden importa: es lo que pasa, mes por mes, entre apartar y mudarte. */
const LINEA = [
  { cuando: "Hoy", titulo: "Apartas", texto: "Firmas con Moretti y das tu anticipo. Tu precio queda congelado." },
  { cuando: "12 meses", titulo: "Pagas mientras se construye", texto: "Mensualidades fijas, sin intereses y sin banco. Puedes adelantar cuando quieras." },
  { cuando: "Entrega", titulo: "Recibes llaves y todo instalado", texto: "Medimos en obra, fabricamos e instalamos. Firmas la recepción y arranca tu garantía." },
];

const FRASE = [
  "El desarrollador te entrega muros,",
  "piso y ventanas. Lo demás corre",
  "por tu cuenta: meses de obras,",
  "polvo y proveedores.",
];

export default async function LandingPage() {
  await connection();
  const paquetes = await prisma.paquete.findMany({ orderBy: { nivel: "asc" } });

  return (
    <div className="ld">
      <Encabezado />

      {/* ── Hero: las paredes en obra blanca se abren y aparece el depa terminado ── */}
      <Escena modo="fija" className="ld-hero">
        <div className="ld-hero-fijo">
          <div className="ld-hero-final">
            <Image src="/interior-hero.jpg" alt="El mismo departamento con cocina, clima y mueble de TV instalados" fill priority sizes="100vw" className="object-cover" />
            <div className="ld-hero-sombra" />
            {PUNTOS.map((p, i) => (
              <span key={p.texto} className="ld-punto" style={{ left: `${p.x}%`, top: `${p.y}%`, "--i": i } as React.CSSProperties}>
                {p.texto}
              </span>
            ))}
          </div>

          {/* Dos mitades de la misma foto «en obra blanca» que se separan. */}
          {(["izq", "der"] as const).map((lado) => (
            <div key={lado} className={`ld-muro ld-muro-${lado}`} aria-hidden="true">
              <div className="ld-muro-foto">
                <Image src="/interior-hero.jpg" alt="" fill sizes="100vw" className="object-cover" />
              </div>
            </div>
          ))}

          <div className="ld-hero-antes">
            <p className="ld-etiqueta">Barrio Roble · Barrio Santa Lucía</p>
            <h1>
              <Palabras texto="Así te entregan tu depa." />
            </h1>
            <p className="ld-bajada">Obra blanca. Desliza para verlo el día uno.</p>
            <span className="ld-indicador" aria-hidden="true" />
          </div>

          <div className="ld-hero-despues">
            <h2>Así lo recibes con día uno.</h2>
            <p>
              Cocina, clósets y clima instalados el día que te dan llaves. Lo pagas en
              mensualidades fijas mientras se construye.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Boton href="/cotizar" flecha>Cotizar mi depa</Boton>
              <Boton href="#instalado" variante="claro">Ver qué incluye</Boton>
            </div>
          </div>
        </div>
      </Escena>

      {/* ── La frase: cada renglón se descubre al barrerse su máscara ── */}
      <section className="ld-seccion">
        <div className="ld-contenedor grid gap-10 md:grid-cols-[200px_1fr]">
          <p className="ld-etiqueta pt-3">El problema</p>
          <AlVer como="p" className="ld-frase">
            {FRASE.map((r, i) => (
              <span key={i} className="ld-renglon" style={{ "--i": i } as React.CSSProperties}>
                {r}
              </span>
            ))}
            <span className="ld-renglon ld-renglon-acento" style={{ "--i": FRASE.length } as React.CSSProperties}>
              Nosotros lo dejamos listo.
            </span>
          </AlVer>
        </div>
      </section>

      {/* ── Lo instalado: las piezas llegan una tras otra con el scroll ── */}
      <Escena id="instalado" className="ld-seccion ld-instalado">
        <div className="ld-contenedor">
          <div className="max-w-[640px]">
            <p className="ld-etiqueta">Qué llega instalado</p>
            <h2 className="ld-titulo mt-3">Lo que normalmente te toma meses después de mudarte.</h2>
          </div>
          <div className="ld-piezas">
            {INSTALADO.map((p, i) => (
              <article key={p.titulo} className="ld-pieza" style={{ "--i": i } as React.CSSProperties}>
                <div className="ld-pieza-foto">
                  <Image src={p.img} alt={p.titulo} fill sizes="(max-width: 768px) 80vw, 25vw" className="object-cover" />
                </div>
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
              </article>
            ))}
          </div>
        </div>
      </Escena>

      {/* ── Cómo se paga: la línea se dibuja con el scroll ── */}
      <Escena id="como" modo="fija" className="ld-como">
        <div className="ld-como-fijo">
          <div className="ld-contenedor w-full">
            <p className="ld-etiqueta">Cómo se paga</p>
            <h2 className="ld-titulo mt-3 max-w-[18ch]">Pagas mientras se construye.</h2>

            <div className="ld-linea">
              <svg viewBox="0 0 1000 20" preserveAspectRatio="none" aria-hidden="true">
                <line x1="0" y1="10" x2="1000" y2="10" className="ld-linea-base" />
                <line x1="0" y1="10" x2="1000" y2="10" pathLength={1} className="ld-linea-trazo" />
              </svg>
              <div className="ld-meses" aria-hidden="true">
                {Array.from({ length: 13 }, (_, i) => (
                  <span key={i} style={{ "--i": i } as React.CSSProperties} />
                ))}
              </div>
            </div>

            <ol className="ld-pasos">
              {LINEA.map((l, i) => (
                <li key={l.titulo} style={{ "--i": i } as React.CSSProperties}>
                  <p className="ld-cuando">{l.cuando}</p>
                  <h3>{l.titulo}</h3>
                  <p>{l.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Escena>

      {/* ── Paquetes ── */}
      <section id="paquetes" className="ld-seccion">
        <div className="ld-contenedor">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-[560px]">
              <p className="ld-etiqueta">Paquetes</p>
              <h2 className="ld-titulo mt-3">Cuatro niveles, o armas el tuyo pieza por pieza.</h2>
            </div>
            <Boton href="/#paquetes" variante="secundario" flecha>Comparar paquetes</Boton>
          </div>
          <ul className="ld-paquetes">
            {paquetes.map((p) => (
              <li key={p.id}>
                <Link href={`/paquetes/${p.slug}`} className="ld-paquete">
                  {p.imagen && (
                    <div className="ld-paquete-foto">
                      <Image src={p.imagen} alt="" fill sizes="(max-width: 768px) 100vw, 20vw" className="object-cover" />
                    </div>
                  )}
                  <span className="ld-cuando">Paquete 0{p.nivel}</span>
                  <span className="ld-paquete-nombre">{p.nombre}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Cierre: el nombre se rellena con el scroll ── */}
      <Escena className="ld-cierre">
        <div className="ld-contenedor flex flex-col items-center text-center">
          <p className="ld-marca" aria-label="día uno">
            <span aria-hidden="true">día uno</span>
          </p>
          <p className="mt-6 max-w-[44ch] text-[17px] text-ink-2">
            Se aparta el mismo día que compras tu departamento. Tu precio queda congelado
            hasta la entrega.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Boton href="/cotizar" flecha>Cotizar mi depa</Boton>
            <Boton href="#como" variante="secundario">Cómo se paga</Boton>
          </div>
        </div>
      </Escena>

      <footer className="border-t border-line py-9">
        <div className="ld-contenedor flex flex-wrap items-end justify-between gap-6 text-sm text-muted">
          <p className="max-w-[52ch] text-[13px]">
            Moretti fabrica, instala, garantiza y factura. día uno presenta el programa,
            estructura el plan y da seguimiento a la cobranza.
          </p>
          <p className="text-[13px]">Monterrey</p>
        </div>
      </footer>
    </div>
  );
}
