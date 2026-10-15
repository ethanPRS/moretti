import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { DESCUENTO_CONTADO } from "@/lib/motor/calculo";
import { cargarCatalogosPorProyecto } from "@/lib/motor/catalogo";
import Reveal from "@/components/Reveal";
import { ContenidoBoton } from "@/components/Boton";
import { Calculadora, Condiciones, ProveedorCotizacion } from "@/components/sitio/Cotizacion";

/*
 * La portada con el diseño y el contenido de la maqueta de Ana Cris (5b).
 * Se dejaron fuera sus secciones internas («Quién ve qué», las pantallas de
 * ejemplo y el back office simulado): el back office real vive en /admin.
 * Animaciones: la entrada del hero, la aparición al hacer scroll (Reveal) y
 * la rueda de texto de los botones, que a Ana Cris sí le gustaron.
 */

const d = (ms: number) => ({ "--hero-delay": `${ms}ms` }) as React.CSSProperties;

export default async function SitioPage() {
  // En cada visita: precios, mínimo y unidades libres viven en la base.
  await connection();
  const [catalogo, paquetes, libres] = await Promise.all([
    cargarCatalogosPorProyecto(),
    prisma.paquete.findMany({ orderBy: { nivel: "asc" } }),
    prisma.unidad.groupBy({ by: ["prototipoId"], where: { comprador: null }, _count: true }),
  ]);
  const desarrollos = catalogo.proyectos.filter((p) => p.prototipos.length > 0);
  const cerrados = paquetes.filter((p) => !p.esArmable);

  return (
    <ProveedorCotizacion>
      <header className="hero">
        <div className="hero-img">
          <Image src="/interior-hero.jpg" alt="Cocina y comedor de un departamento equipado" fill sizes="100vw" className="object-cover" priority />
        </div>
        <div className="hero-txt">
          <div className="wrap">
            <p className="eyebrow hero-in">Barrio Roble · Barrio Santa Lucía</p>
            <h1 className="hero-in" style={d(110)}>Estrena tu departamento completo desde el día uno.</h1>
            <p className="hero-in" style={d(220)}>
              Cocina, clósets y clima instalados el día que recibes llaves. Lo pagas en mensualidades fijas mientras
              se construye, sin banco y sin tocar tu hipoteca.
            </p>
            <a className="btn hero-in" href="#calc" style={{ ...d(330), marginTop: 24 }}>
              <ContenidoBoton texto="Cotiza tu departamento" />
            </a>
          </div>
        </div>
      </header>

      <section id="calc">
        <div className="wrap">
          <Reveal className="sec-head narrow">
            <p className="eyebrow">Cotiza tu departamento</p>
            <h2>Dinos cuál es tu depa y te decimos cuánto.</h2>
            <p>Cada prototipo lleva medidas distintas, así que el precio cambia. Elige el tuyo y mueve entre paquetes para comparar.</p>
          </Reveal>
          <Reveal delay={80}>
            <Calculadora
              desarrollos={desarrollos}
              armable={catalogo.armable}
              descuentoContado={DESCUENTO_CONTADO}
              disponibles={Object.fromEntries(libres.map((l) => [l.prototipoId, l._count]))}
            />
          </Reveal>
        </div>
      </section>

      <hr className="rule" />

      <section id="paquetes" className="alt">
        <div className="wrap">
          <Reveal className="sec-head narrow">
            <p className="eyebrow">Los paquetes</p>
            <h2>Cuatro niveles que se acumulan, y uno que armas tú.</h2>
          </Reveal>
          <div className="pks">
            {paquetes.map((p, i) => {
              const heredadas = p.esArmable ? [] : cerrados.slice(0, cerrados.indexOf(p)).flatMap((x) => x.partidas);
              return (
                <Reveal key={p.id} delay={i * 80}>
                  <article className="pk">
                    <div className="pk-img">
                      {p.imagen && <Image src={p.imagen} alt="" fill sizes="(max-width: 600px) 100vw, (max-width: 900px) 50vw, 20vw" className="object-cover" />}
                    </div>
                    <div className="pk-body">
                      <p className="pk-n">Paquete 0{p.nivel}</p>
                      <h3>{p.nombre}</h3>
                      <p className="pk-sub">{p.descripcion}</p>
                      <ul className="pk-list">
                        {heredadas.map((x) => <li key={x} className="old">{x}</li>)}
                        {p.partidas.map((x) => <li key={x} className="new">{x}</li>)}
                      </ul>
                      <Link href={`/paquetes/${p.slug}`} className="btn btn-ghost">
                        <ContenidoBoton texto="Ver qué incluye" />
                      </Link>
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>
          <p className="disclaimer" style={{ marginTop: 18, maxWidth: "72ch" }}>
            Cualquier partida del catálogo se puede <b>agregar</b> a un paquete a precio de lista. Si <b>quitas</b> una
            partida de un paquete, lo que queda se cobra pieza por pieza, también a precio de lista. El plan a 12 meses
            aplica desde $50,000; abajo de eso, de contado.
          </p>
        </div>
      </section>

      <section id="como" className="como">
        <div className="wrap">
          <Reveal className="sec-head narrow">
            <p className="eyebrow">Cómo funciona</p>
            <h2>Pagas mientras se construye. Recibes todo instalado.</h2>
            <p>Desde que apartas hasta que te entregan llaves pasan unos dieciocho meses. Para entonces ya terminaste de pagar.</p>
          </Reveal>

          <Reveal className="como-barra" delay={60}>
            <div className="cb-hoy"><b>Hoy</b><span>Anticipo</span></div>
            <div className="cb-pagos"><b>Meses 1 a 12</b><span>Mensualidades fijas</span></div>
            <div className="cb-obra"><b>Obra</b><span>Ya pagado</span></div>
            <div className="cb-llaves"><b>Llaves</b><span>Instalado</span></div>
          </Reveal>

          <ol className="como-pasos">
            <Reveal as="li" className="cp">
              <p className="cp-n" aria-hidden="true">1</p>
              <p className="cp-cuando">Hoy</p>
              <h3>Eliges, firmas y apartas</h3>
              <p>Escoges tu paquete, aceptas las condiciones, firmas con Moretti y das tu anticipo.</p>
              <p className="cp-clave"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Tu precio queda congelado</p>
            </Reveal>
            <Reveal as="li" className="cp" delay={110}>
              <p className="cp-n" aria-hidden="true">2</p>
              <p className="cp-cuando">Meses 1 a 12</p>
              <h3>Pagas cada mes</h3>
              <p>Mensualidades fijas que se cargan solas a tu tarjeta. Te avisamos antes de cada una.</p>
              <p className="cp-clave"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Sin intereses ni crédito</p>
            </Reveal>
            <Reveal as="li" className="cp" delay={220}>
              <p className="cp-n" aria-hidden="true">3</p>
              <p className="cp-cuando">Al recibir llaves</p>
              <h3>Recibes tu depa listo</h3>
              <p>Medimos en obra, fabricamos a tu medida e instalamos en cuanto te entregan tu unidad.</p>
              <p className="cp-clave"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Garantía desde el acta</p>
            </Reveal>
          </ol>
        </div>
      </section>

      <section id="registro" className="alt">
        <div className="wrap narrow">
          <Reveal className="sec-head">
            <p className="eyebrow">Aparta tu paquete</p>
            <h2>Antes de decir que sí, lee esto.</h2>
            <p>Ocho puntos: lo mismo que dice tu contrato, en corto. Márcalos y seguimos con tus datos y la firma.</p>
          </Reveal>
          <Reveal delay={80}>
            <Condiciones />
          </Reveal>
        </div>
      </section>

      <section className="tight">
        <div className="wrap">
          <Reveal className="sec-head narrow">
            <p className="eyebrow">Los cuatro momentos que definen todo</p>
            <h2>Cuándo se firma, cuándo se congela el precio y cuándo ya no hay cambios.</h2>
          </Reveal>
          <ol className="momentos">
            <Reveal as="li" className="mom">
              <p className="mm"><span>día</span> 0</p>
              <b>Firma el contrato</b>
              <p>Con Moretti, antes de pagar. Sin contrato firmado el sistema no cobra.</p>
            </Reveal>
            <Reveal as="li" className="mom on" delay={90}>
              <p className="mm"><span>día</span> 0</p>
              <b>Paga el anticipo</b>
              <p>Activa todo: <strong>se congela el precio</strong> y se aparta tu lugar en producción.</p>
            </Reveal>
            <Reveal as="li" className="mom" delay={180}>
              <p className="mm"><span>día hábil</span> 5</p>
              <b>Cierra el arrepentimiento</b>
              <p>Hasta ese día puedes echarte para atrás y se te devuelve todo, sin penalización.</p>
            </Reveal>
            <Reveal as="li" className="mom on" delay={270}>
              <p className="mm"><span>mes</span> ~15</p>
              <b>Levantamiento en obra</b>
              <p>Se mide tu cocina real. <strong>Después ya no hay cambios</strong> de paquete ni de acabados.</p>
            </Reveal>
          </ol>
          <Reveal className="factura">
            <div>
              <p className="eyebrow">Y la factura</p>
              <h3>Tu comprobante desde el día uno, aunque no hayas terminado de pagar.</h3>
              <p>Como el producto y el precio quedan definidos al firmar, tus pagos son parcialidades. Emitir las facturas le toca a Moretti; <b>vigilar que no se pase ninguna le toca al sistema</b>.</p>
            </div>
            <ul>
              <li><b>Al firmar</b><span>Factura por el total, en parcialidades</span></li>
              <li><b>Con cada pago</b><span>Un complemento de pago</span></li>
              <li><b>Fecha límite</b><span>Día 5 del mes siguiente al pago</span></li>
            </ul>
          </Reveal>
        </div>
      </section>

      <section id="supervision" className="alt">
        <div className="wrap">
          <Reveal className="sec-head narrow">
            <p className="eyebrow">Supervisión y medidas</p>
            <h2>Nadie mide su propio trabajo.</h2>
            <p>Entre que apartas y que recibes tu cocina pasan dieciocho meses y una obra entera. Por eso un tercero mide en sitio, verifica la instalación y firma la entrega.</p>
          </Reveal>
          <div className="sup">
            <Reveal className="sup-card">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17 17 3l4 4L7 21z" /><path d="m7 13 2 2m1-5 2 2m1-5 2 2" /></svg>
              <p className="sup-n">01 · Medición</p>
              <h3>Se mide en obra</h3>
              <p>Al entregarte la unidad, el verificador toma las medidas reales de cocina y clósets. Una cocina se hace al milímetro, no sobre planos.</p>
              <p className="sup-nota">Esta fecha cierra los cambios.</p>
            </Reveal>
            <Reveal className="sup-card" delay={110}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M4 12h16M12 3v18M10 8h.01M14 16h.01" /></svg>
              <p className="sup-n">02 · Instalación</p>
              <h3>Se fabrica e instala</h3>
              <p>Moretti produce sobre la medida real e instala en el plazo pactado. El verificador revisa avance y calidad, y todo queda en tu expediente.</p>
            </Reveal>
            <Reveal className="sup-card" delay={220}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 14l2 2 4-4" /></svg>
              <p className="sup-n">03 · Entrega</p>
              <h3>Se recibe con acta</h3>
              <p>Lista de verificación punto por punto, fotos de cada área y acta firmada por ti. Sin acta no hay entrega.</p>
              <p className="sup-nota">Tu garantía arranca ese día.</p>
            </Reveal>
          </div>
          <Reveal className="quien">
            <div className="quien-txt">
              <p className="eyebrow">Quién verifica</p>
              <h3>Un despacho de arquitectura independiente.</h3>
              <p>No fabrica ni instala: mide, verifica y levanta el acta. Así siempre tienes a quién llamar. <span className="quien-pc">(Por confirmar.)</span></p>
            </div>
            <div className="quien-diag" aria-label="El verificador queda en medio, ajeno al fabricante y al desarrollador">
              <span>Fabricante</span>
              <i />
              <span className="yo">Verificador</span>
              <i />
              <span>Desarrollador</span>
            </div>
          </Reveal>
          <Reveal className="owns">
            <div><p className="eyebrow">Para el fabricante</p><p>Fabrica sobre medidas de obra: menos reprocesos, menos ajustes en sitio y una entrega documentada que cierra la discusión antes de que empiece.</p></div>
            <div><p className="eyebrow">Para el desarrollador</p><p>La calidad del equipamiento queda verificada por un tercero, y las incidencias se resuelven en el expediente, sin llegar a su posventa.</p></div>
          </Reveal>
        </div>
      </section>

      <section className="cierre">
        <div className="wrap">
          <Reveal>
            <div className="brand">dia<em>´</em>uno</div>
            <p>Todos los días es tu día uno.</p>
            <div className="lock">
              <span className="con">fabrica, instala y garantiza</span>
              <span className="sep" />
              {/* eslint-disable-next-line @next/next/no-img-element -- logo pequeño, igual que en la maqueta */}
              <img src="/moretti-style.png" alt="Moretti Style" />
            </div>
          </Reveal>
        </div>
      </section>
    </ProveedorCotizacion>
  );
}
