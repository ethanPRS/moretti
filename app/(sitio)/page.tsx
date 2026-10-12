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

      <section id="como">
        <div className="wrap">
          <Reveal className="sec-head narrow">
            <p className="eyebrow">Cómo funciona</p>
            <h2>Pagas mientras se construye. Recibes todo instalado.</h2>
          </Reveal>
          <div className="pasos">
            <Reveal className="paso">
              <div className="dot">1</div>
              <h3>Eliges, firmas y apartas</h3>
              <p>Escoges tu paquete, <b>lees y aceptas las condiciones</b>, firmas tu contrato con Moretti y das tu anticipo. Tu precio queda congelado hasta la entrega, aunque falten dieciocho meses.</p>
            </Reveal>
            <Reveal className="paso" delay={110}>
              <div className="dot">2</div>
              <h3>Pagas cada mes</h3>
              <p>Doce mensualidades fijas, sin intereses y sin trámite de crédito. Se cargan solas a tu tarjeta y te avisamos antes de cada una.</p>
            </Reveal>
            <Reveal className="paso" delay={220}>
              <div className="dot">3</div>
              <h3>Recibes tu depa listo</h3>
              <p>Medimos en obra antes de fabricar, e instalamos en cuanto el desarrollador te entrega tu unidad. Firmas el acta de recepción y ahí arranca tu garantía. Estrenas departamento, no obra blanca.</p>
            </Reveal>
          </div>
        </div>
      </section>

      <section id="registro" className="alt">
        <div className="wrap narrow">
          <Reveal className="sec-head">
            <p className="eyebrow">Aparta tu paquete</p>
            <h2>Antes de decir que sí, lee esto.</h2>
            <p>Son ocho puntos. Es lo mismo que dice tu contrato, en corto. Cuando los marques todos, seguimos con tus datos y la firma.</p>
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
          <Reveal className="momentos">
            <div><p className="mm">Día 0</p><b>Firma el contrato</b><p>Con Moretti, antes de pagar. Sin contrato firmado el sistema no cobra: un cobro sin contrato es dinero que hay que devolver.</p></div>
            <div className="on"><p className="mm">Día 0</p><b>Paga el anticipo</b><p>Es el acto que activa todo. Aquí se congela el precio y se aparta el lugar en producción. Antes de esto no hay nada apartado.</p></div>
            <div><p className="mm">Día 5 hábil</p><b>Cierra el arrepentimiento</b><p>Hasta ese día puede echarse para atrás y se le devuelve todo, sin penalización. Después, aplica lo que diga el contrato.</p></div>
            <div className="on"><p className="mm">Mes ~15</p><b>Levantamiento en obra</b><p>Se mide su cocina real. <b>Después de esta fecha ya no hay cambio de paquete ni de acabados</b>, porque el material ya se comprometió.</p></div>
          </Reveal>
          <Reveal className="fiscal">
            <b>Y la factura, aunque no haya terminado de pagar.</b>
            <p>Como el producto y el precio ya están definidos al firmar, los pagos no son anticipos: son parcialidades. Moretti emite una factura por el total al momento de la operación, con método de pago en parcialidades, y después un complemento de pago por cada mensualidad cobrada. El comprador tiene su comprobante desde el día uno, aunque le falten once mensualidades. Y cada complemento tiene fecha límite de ley: el quinto día natural del mes siguiente al del pago. Emitirlos le toca a Moretti; <b>vigilar que no se pase ninguno le toca al sistema</b>, que marca cada cobro como pendiente hasta que tiene su folio registrado.</p>
          </Reveal>
        </div>
      </section>

      <section id="supervision" className="alt">
        <div className="wrap">
          <Reveal className="sec-head narrow">
            <p className="eyebrow">Supervisión y medidas</p>
            <h2>Nadie mide su propio trabajo.</h2>
            <p>Entre que el comprador aparta y que recibe su cocina pasan dieciocho meses y una obra entera. Por eso hay un tercero que mide en sitio, verifica la instalación y firma la entrega: ni el fabricante ni el desarrollador.</p>
          </Reveal>
          <div className="pasos">
            <Reveal className="paso">
              <div className="dot">1</div>
              <h3>Se mide en obra</h3>
              <p>Cuando el desarrollador entrega la unidad, un verificador independiente toma las medidas reales de la cocina y los clósets. Los planos no traen cotas de fabricante y una cocina se hace al milímetro. <b>Esta fecha cierra los cambios:</b> después ya no hay cambio de paquete ni de acabados, porque el material se compromete.</p>
            </Reveal>
            <Reveal className="paso" delay={110}>
              <div className="dot">2</div>
              <h3>Se fabrica e instala</h3>
              <p>Moretti produce sobre la medida real, no sobre el render, e instala en el plazo pactado desde que el desarrollador entrega llaves. El mismo verificador revisa avance y calidad durante la instalación, y lo que encuentra queda en el expediente de la unidad.</p>
            </Reveal>
            <Reveal className="paso" delay={220}>
              <div className="dot">3</div>
              <h3>Se recibe con acta</h3>
              <p>Lista de verificación punto por punto, fotos de cada área y <b>acta firmada</b> por el comprador. Sin acta, la unidad no se da por entregada — y la garantía arranca en esa fecha, no antes.</p>
            </Reveal>
          </div>
          <Reveal className="fiscal">
            <b>Quién verifica</b>
            <p>Un despacho de arquitectura independiente, ajeno al fabricante y al desarrollador (por confirmar). No fabrica ni instala: mide, verifica y levanta el acta. Es la figura que hace que el comprador tenga a quién llamar y que nadie termine calificando su propio trabajo.</p>
          </Reveal>
          <Reveal className="owns">
            <div><b>Lo que resuelve para el fabricante</b><p>Fabrica sobre medidas tomadas en obra y no sobre planos: menos reprocesos, menos ajustes en sitio y una entrega documentada que cierra la discusión antes de que empiece.</p></div>
            <div className="no"><b>Lo que resuelve para el desarrollador</b><p>La calidad del equipamiento dentro de su edificio queda verificada por un tercero, y las incidencias se resuelven en el expediente de la unidad, sin llegar a su mesa de posventa.</p></div>
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
