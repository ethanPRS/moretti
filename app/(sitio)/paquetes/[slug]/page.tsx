import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import Reveal from "@/components/Reveal";
import {
  ETIQUETA_FAMILIA,
  FichaProducto,
  FotoProducto,
  type ProductoVista,
} from "@/components/FichaProducto";

const mx = (n: number) => "$" + n.toLocaleString("es-MX");

async function cargarPaquete(slug: string) {
  return prisma.paquete.findUnique({
    where: { slug },
    include: {
      catalogo: { orderBy: { orden: "asc" } },
      precios: { where: { vigenteHasta: null } },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const paquete = await prisma.paquete.findUnique({ where: { slug } });
  return { title: paquete ? `${paquete.nombre} · día uno` : "día uno" };
}

export default async function PaqueteDetallePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const paquete = await cargarPaquete(slug);
  if (!paquete) notFound();

  // Los cerrados son acumulativos: el 03 trae lo del 01 y el 02. Esos productos
  // viven en el catálogo de los paquetes anteriores, así que se juntan aquí.
  const anteriores = paquete.esArmable
    ? []
    : await prisma.partida.findMany({
        where: { paquetes: { some: { nivel: { lt: paquete.nivel }, esArmable: false } } },
        orderBy: { orden: "asc" },
      });

  const aVista = (p: (typeof anteriores)[number]): ProductoVista => ({
    clave: p.clave,
    nombre: p.nombre,
    familia: p.familia,
    porEquipo: p.porEquipo,
    llevaPlano: p.llevaPlano,
    imagen: p.imagen,
    ficha: p.ficha as ProductoVista["ficha"],
    acabados: p.acabados as ProductoVista["acabados"],
  });

  const nuevos = paquete.catalogo.map(aVista);
  const heredados = anteriores.map(aVista);
  const todos = [...heredados, ...nuevos];

  const montos = paquete.precios.map((p) => Number(p.monto));
  const desde = montos.length ? Math.min(...montos) : null;
  const hasta = montos.length ? Math.max(...montos) : null;

  // Galería: el render del paquete y dos acercamientos recortados de los
  // renders del proyecto (public/paquetes/detalle). Cuando Moretti mande fotos
  // por paquete, esto pasa a una columna en Paquete.
  const principal = paquete.imagen
    ? [{ src: paquete.imagen, alt: `Interior con el paquete ${paquete.nombre}` }]
    : [];
  // «Arma el tuyo» sale de un recorte del render de la cocina: si su galería
  // también fueran recortes, se vería la misma cocina cuatro veces. Mejor
  // mostrar de dónde escoge: la sala con pantalla, el muro y un depa completo.
  const galeria = paquete.esArmable
    ? [
        ...principal,
        { src: "/productos/tv.jpg", alt: "Sala con pantalla de gran formato" },
        { src: "/productos/panel.jpg", alt: "Muro decorativo y carpintería" },
        { src: "/paquetes/total.jpg", alt: "Departamento con todo instalado" },
      ]
    : [
        ...principal,
        { src: `/paquetes/detalle/${paquete.slug}-1.jpg`, alt: `Detalle del paquete ${paquete.nombre}` },
        { src: `/paquetes/detalle/${paquete.slug}-2.jpg`, alt: `Otro detalle del paquete ${paquete.nombre}` },
        { src: "/interior-hero.jpg", alt: "Sala y cocina del departamento muestra" },
      ];

  // El mínimo es por proyecto; esta página no es de un proyecto, así que
  // muestra el más bajo con el que se puede financiar.
  const minimo = await prisma.proyecto.aggregate({ _min: { minimoPlan: true } });
  const minimoPlan = Number(minimo._min.minimoPlan ?? 0);

  const otros = await prisma.paquete.findMany({
    where: { NOT: { id: paquete.id } },
    orderBy: { nivel: "asc" },
    select: { slug: true, nombre: true, nivel: true },
  });

  return (
    <>
      <section className="border-b border-line">
        <div className="mx-auto max-w-[1080px] px-7 pb-12 pt-10">
          <Link href="/#paquetes" className="text-[14px] text-muted hover:text-accent">
            ← Todos los paquetes
          </Link>

          <div className="mt-6 grid items-end gap-8 md:grid-cols-[1.4fr_1fr]">
            <Reveal>
              <p className={`eyebrow ${paquete.esArmable ? "text-warm" : ""}`}>
                Paquete 0{paquete.nivel}
                {paquete.esArmable ? " · a tu medida" : ""}
              </p>
              <h1 className="mt-2.5 text-[clamp(36px,5vw,56px)]">{paquete.nombre}</h1>
              <p className="mt-3 max-w-[48ch] text-[clamp(16px,1.6vw,19px)] text-ink-2">
                {paquete.esArmable
                  ? "Sin cocina. Marcas pieza por pieza lo que quieres en tu depa y pagas cada una a precio de lista."
                  : `${paquete.descripcion}. Se entrega instalado el día que recibes tu depa.`}
              </p>
            </Reveal>

            <Reveal delay={120} className="card p-6">
              {desde !== null && hasta !== null ? (
                <>
                  <p className="label">Según tu departamento</p>
                  <p className="figure mt-1.5 text-[34px] leading-none">
                    {mx(desde)}
                    <span className="text-[18px] text-muted"> – {mx(hasta)}</span>
                  </p>
                  <p className="mt-2 text-[13.5px] text-muted">
                    + IVA · instalado · o en 12 mensualidades sin intereses
                  </p>
                </>
              ) : (
                <>
                  <p className="label">Tú decides el total</p>
                  <p className="mt-1.5 text-[15px] text-ink-2">
                    Plan a 12 meses desde <b className="text-ink">{mx(minimoPlan)}</b>. Abajo de eso
                    se paga de contado.
                  </p>
                </>
              )}
              <Link
                href="/#cotiza"
                className={`btn mt-5 w-full text-center ${paquete.esArmable ? "btn-warm" : ""}`}
              >
                {paquete.esArmable ? "Armar el mío" : "Cotizar con mi depa"}
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Galería */}
      <section className="py-12">
        <div className="mx-auto max-w-[1080px] px-7">
          <Reveal className="grid gap-3 md:grid-cols-4 md:grid-rows-2">
            {galeria.map((img, i) => (
              <div
                key={img.src + i}
                className={`media relative ${
                  i === 0 ? "aspect-[4/3] md:col-span-2 md:row-span-2 md:aspect-auto" : "aspect-[4/3]"
                }`}
              >
                <Image
                  src={img.src}
                  alt={img.alt}
                  fill
                  sizes={i === 0 ? "(max-width: 768px) 100vw, 540px" : "(max-width: 768px) 100vw, 270px"}
                  className="object-cover"
                  priority={i === 0}
                />
              </div>
            ))}
            {Array.from({ length: Math.max(0, 5 - galeria.length) }, (_, i) => (
              <div
                key={`hueco-${i}`}
                className="grid aspect-[4/3] place-items-center rounded-img border border-dashed border-line-2 bg-surface-2 text-center text-[12px] uppercase tracking-[0.13em] text-muted"
              >
                Más fotos · Moretti
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* Render */}
      <section className="pb-14">
        <div className="mx-auto max-w-[1080px] px-7">
          <Reveal className="grid overflow-hidden rounded-card border border-dashed border-line-2 bg-surface-2 md:grid-cols-[1fr_1.3fr]">
            <div className="flex flex-col justify-center gap-3 p-8 sm:p-10">
              <p className="eyebrow">Así se vería en tu depa</p>
              <h2 className="text-[clamp(23px,2.8vw,30px)]">
                El render de tu prototipo, con {paquete.nombre}.
              </h2>
              <p className="text-[15px] text-ink-2">
                Aquí va el render del departamento muestra con este paquete instalado. Lo
                entrega Moretti por prototipo; mientras, puedes verlo en persona en el
                depa muestra.
              </p>
            </div>
            <div className="relative grid min-h-[260px] place-items-center border-t border-dashed border-line-2 md:border-l md:border-t-0">
              <div className="text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-dashed border-line-2 text-[22px] text-line-2">
                  ◰
                </div>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                  Espacio para render
                </p>
                <p className="mt-1 text-[12.5px] text-muted">16:9 · JPG o PNG · 1920 px</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Producto por producto */}
      <section id="incluye" className="bg-surface-2 py-[68px]">
        <div className="mx-auto max-w-[1080px] px-7">
          <Reveal className="max-w-[660px]">
            <p className="eyebrow">
              {paquete.esArmable ? "De dónde escoges" : "Qué incluye"}
            </p>
            <h2 className="mt-2.5 text-[clamp(25px,3.2vw,35px)]">Producto por producto.</h2>
            <p className="mt-3 text-ink-2">
              {paquete.esArmable
                ? "Todo lo que se vende en los paquetes, menos la cocina. Marca lo que quieras en el cotizador; los climas los eliges por equipo."
                : "Cada producto con su ficha técnica y sus acabados. Eliges uno por producto cuando apartas, y lo puedes cambiar hasta el levantamiento en obra."}
            </p>
          </Reveal>

          <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(paquete.esArmable ? nuevos : todos).map((producto, i) => {
              const heredado = !paquete.esArmable && i < heredados.length;
              return (
                <Reveal key={producto.clave} delay={(i % 3) * 80} className="flex">
                  <article className="card flex flex-1 flex-col overflow-hidden">
                    <FotoProducto
                      enTarjeta
                      producto={producto}
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 340px"
                    />
                    <div className="flex flex-1 flex-col gap-4 p-5">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="chip wait">{ETIQUETA_FAMILIA[producto.familia]}</span>
                          {producto.porEquipo && <span className="chip info">Por equipo</span>}
                          {heredado && <span className="chip ok">Del paquete anterior</span>}
                        </div>
                        <h3 className="mt-2.5 text-[19px]">{producto.nombre}</h3>
                      </div>
                      <FichaProducto producto={producto} />
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>

          <p className="mt-6 text-[13px] text-muted">
            Los datos marcados «Lo define Moretti» y los colores son de ejemplo mientras
            Moretti entrega su catálogo.
          </p>
        </div>
      </section>

      {/* Cómo se entrega */}
      <section className="py-[68px]">
        <div className="mx-auto grid max-w-[1080px] gap-8 px-7 sm:grid-cols-3">
          {[
            ["Precio congelado", "Tu precio queda fijo desde el anticipo, aunque la entrega sea en 2028."],
            ["Medido en obra", "Antes de fabricar se mide tu depa. Lo que va a la medida se hace sobre ese plano."],
            ["Instalado y con garantía", "Se instala cuando recibes llaves. Firmas el acta y ahí arranca tu garantía."],
          ].map(([titulo, texto], i) => (
            <Reveal key={titulo} delay={i * 100}>
              <div className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft font-semibold text-accent">
                {i + 1}
              </div>
              <h3 className="mt-3.5 text-[19px]">{titulo}</h3>
              <p className="mt-1.5 text-[15px] text-ink-2">{texto}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="pb-[76px]">
        <div className="mx-auto max-w-[1080px] px-7">
          <Reveal className="card flex flex-col items-start justify-between gap-6 bg-surface-2 p-9 sm:flex-row sm:items-center">
            <div>
              <p className="label">Compara con</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {otros.map((o) => (
                  <Link key={o.slug} href={`/paquetes/${o.slug}`} className="btn btn-ghost btn-sm">
                    0{o.nivel} · {o.nombre}
                  </Link>
                ))}
              </div>
            </div>
            <Link href="/#cotiza" className="btn">
              Cotizar mi depa
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
