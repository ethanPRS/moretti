import Image from "next/image";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calcularExhibiciones, DESCUENTO_CONTADO } from "@/lib/motor/calculo";
import Cotizador, { type Desarrollo } from "./Cotizador";
import Reveal from "@/components/Reveal";

const { Decimal } = Prisma;

const PASOS = [
  {
    titulo: "Eliges, firmas y apartas",
    texto:
      "Escoges tu paquete en el depa muestra, firmas tu contrato con Moretti y das tu anticipo. Tu precio queda congelado hasta la entrega, aunque falten dieciocho meses.",
  },
  {
    titulo: "Pagas cada mes",
    texto:
      "Doce mensualidades fijas, sin intereses y sin trámite de crédito. Se cargan solas a tu tarjeta. Puedes adelantar o liquidar cuando quieras.",
  },
  {
    titulo: "Recibes tu depa listo",
    texto:
      "Medimos en obra antes de fabricar, e instalamos en cuanto el desarrollador te entrega tu unidad. Firmas el acta de recepción y ahí arranca tu garantía.",
  },
];

export default async function SitioPage() {
  const [proyectos, paquetes] = await Promise.all([
    prisma.proyecto.findMany({
      include: {
        prototipos: {
          include: {
            precios: {
              where: { vigenteHasta: null },
              include: { paquete: true },
              orderBy: { paquete: { nivel: "asc" } },
            },
          },
          orderBy: { clave: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.paquete.findMany({ orderBy: { nivel: "asc" } }),
  ]);

  // Se cotiza con el mismo motor que después ejecuta los cobros, para que lo
  // que ve el comprador sea exactamente lo que se le va a cargar.
  const desarrollos: Desarrollo[] = proyectos.map((proyecto) => ({
    id: proyecto.id,
    nombre: proyecto.nombre,
    prototipos: proyecto.prototipos
      .filter((proto) => proto.precios.length > 0)
      .map((proto) => ({
        id: proto.id,
        clave: proto.clave,
        superficie: Number(proto.superficie),
        recamaras: proto.recamaras,
        cotizaciones: proto.precios.map((precio) => {
          const exhibiciones = calcularExhibiciones(
            new Decimal(precio.monto),
            new Decimal(proyecto.porcentajeAnticipo)
          );
          const total = Number(precio.monto);
          const contado = Math.round(total * (1 - DESCUENTO_CONTADO));
          return {
            paqueteId: precio.paqueteId,
            paqueteNombre: precio.paquete.nombre,
            nivel: precio.paquete.nivel,
            total,
            anticipo: exhibiciones[0].monto.toNumber(),
            mensualidad: exhibiciones[1].monto.toNumber(),
            contado,
            ahorro: total - contado,
          };
        }),
      })),
  }));

  return (
    <>
      <section className="relative isolate flex min-h-[clamp(420px,60vh,560px)] items-center overflow-hidden">
        <Image
          src="/interior-hero.jpg"
          alt="Departamento con cocina integral, clima y sala instalados"
          fill
          sizes="100vw"
          className="-z-10 object-cover"
          priority
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[rgba(20,19,17,0.9)] via-[rgba(20,19,17,0.72)] to-[rgba(20,19,17,0.18)]" />

        <div className="mx-auto w-full max-w-[1080px] px-7 py-16">
          <p className="eyebrow hero-in text-[#b9cdbe]">
            Barrio Roble · Barrio Santa Lucía
          </p>
          <h1
            className="hero-in mt-3.5 max-w-[17ch] text-[clamp(32px,4.4vw,52px)] text-[#fbfaf8]"
            style={{ "--hero-delay": "110ms" } as React.CSSProperties}
          >
            Tu depa se entrega en obra blanca. No tiene que quedarse así.
          </h1>
          <p
            className="hero-in mt-5 max-w-[46ch] text-[clamp(16px,1.6vw,19px)] text-[#dcd8d2]"
            style={{ "--hero-delay": "220ms" } as React.CSSProperties}
          >
            Cocina, clósets y clima instalados el día que recibes llaves. Lo pagas en
            mensualidades fijas mientras se construye, sin banco y sin tocar tu hipoteca.
          </p>
          <a
            href="#cotiza"
            className="btn hero-in mt-8"
            style={{ "--hero-delay": "330ms" } as React.CSSProperties}
          >
            Cotizar mi depa
          </a>
        </div>
      </section>

      <section id="cotiza" className="py-[76px]">
        <div className="mx-auto max-w-[1080px] px-7">
          <Reveal className="max-w-[660px]">
            <p className="eyebrow">Cotiza tu departamento</p>
            <h2 className="mt-2.5 text-[clamp(25px,3.2vw,35px)]">
              Dinos cuál es tu depa y te decimos cuánto.
            </h2>
            <p className="mt-3 text-ink-2">
              Cada prototipo lleva medidas distintas, así que el precio cambia. Elige el
              tuyo y mueve entre paquetes para comparar.
            </p>
          </Reveal>

          <Reveal className="mt-8" delay={120}>
            <Cotizador desarrollos={desarrollos} />
          </Reveal>
        </div>
      </section>

      <section id="paquetes" className="bg-surface-2 py-[76px]">
        <div className="mx-auto max-w-[1080px] px-7">
          <Reveal className="max-w-[660px]">
            <p className="eyebrow">Los paquetes</p>
            <h2 className="mt-2.5 text-[clamp(25px,3.2vw,35px)]">
              Cuatro niveles. Cada uno incluye todo el anterior.
            </h2>
          </Reveal>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {paquetes.map((p, i) => {
              const heredadas = paquetes.slice(0, i).flatMap((prev) => prev.partidas);
              return (
                <Reveal key={p.id} delay={i * 90} className="flex">
                  <article className="card lift flex flex-1 flex-col overflow-hidden">
                  {p.imagen && (
                    <div className="relative aspect-[4/3] bg-surface-2">
                      <Image
                        src={p.imagen}
                        alt={`Interior con el paquete ${p.nombre}`}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-3 p-5">
                    <div>
                      <p className="eyebrow">Paquete 0{p.nivel}</p>
                      <h3 className="mt-1.5 text-[23px]">{p.nombre}</h3>
                      <p className="mt-1 text-[13.5px] text-muted">{p.descripcion}</p>
                    </div>
                    <ul className="flex flex-col gap-1.5 border-t border-line pt-3.5 text-[14px]">
                      {heredadas.map((partida) => (
                        <li key={partida} className="relative pl-4 text-muted">
                          <span className="absolute left-0 text-line-2">·</span>
                          {partida}
                        </li>
                      ))}
                      {p.partidas.map((partida) => (
                        <li
                          key={partida}
                          className="relative pl-4 font-semibold text-ink"
                        >
                          <span className="absolute left-0 font-bold text-accent">+</span>
                          {partida}
                        </li>
                      ))}
                    </ul>
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section id="como" className="py-[76px]">
        <div className="mx-auto max-w-[1080px] px-7">
          <Reveal className="max-w-[660px]">
            <p className="eyebrow">Cómo funciona</p>
            <h2 className="mt-2.5 text-[clamp(25px,3.2vw,35px)]">
              Pagas mientras se construye. Recibes todo instalado.
            </h2>
          </Reveal>

          <div className="mt-9 grid gap-9 sm:grid-cols-3">
            {PASOS.map((paso, i) => (
              <Reveal key={paso.titulo} delay={i * 110}>
                <div className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft font-semibold text-accent">
                  {i + 1}
                </div>
                <h3 className="mt-3.5 text-[21px]">{paso.titulo}</h3>
                <p className="mt-2 text-[15.5px] text-ink-2">{paso.texto}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-[76px]">
        <div className="mx-auto max-w-[1080px] px-7">
          <Reveal className="card flex flex-col items-start gap-5 bg-surface-2 p-10 sm:p-12">
            <div>
              <p className="eyebrow">Aparta tu paquete</p>
              <h2 className="mt-2.5 max-w-[20ch] text-[clamp(25px,3.2vw,35px)]">
                Se aparta el mismo día que compras tu departamento.
              </h2>
              <p className="mt-3 max-w-[58ch] text-ink-2">
                Firmas tu contrato con Moretti, das tu anticipo y tu precio queda
                congelado hasta la entrega. Te contactamos para agendar la visita al depa
                muestra.
              </p>
            </div>
            <a href="#cotiza" className="btn">
              Cotizar mi depa
            </a>
          </Reveal>
        </div>
      </section>
    </>
  );
}
