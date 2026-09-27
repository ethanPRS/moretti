import Image from "next/image";

export type FichaPar = [string, string];
export type Acabado = [string, string];

export type ProductoVista = {
  clave: string;
  nombre: string;
  familia: "A_LA_MEDIDA" | "DE_CATALOGO" | "VALE";
  porEquipo: boolean;
  llevaPlano: boolean;
  imagen: string | null;
  ficha: FichaPar[];
  acabados: Acabado[] | null;
};

export const ETIQUETA_FAMILIA: Record<ProductoVista["familia"], string> = {
  A_LA_MEDIDA: "A la medida",
  DE_CATALOGO: "De catálogo",
  VALE: "Vale",
};

/** La maqueta escribe «— Moretti» donde el dato todavía no existe. */
const pendiente = (valor: string) => valor.includes("— Moretti");

/** «— Moretti: tienda» → «Lo define Moretti: tienda»; a media frase, en minúscula. */
const legible = (valor: string) =>
  valor.trim().startsWith("—")
    ? valor.replace(/^—\s*/, "Lo define ")
    : valor.replace("— Moretti", "lo define Moretti");

/**
 * Cuando Moretti todavía no manda la foto. Se dice, no se disimula con una
 * imagen de relleno que después nadie recuerda cambiar.
 */
function SinFoto({ nombre }: { nombre: string }) {
  return (
    <div className="grid h-full place-items-center bg-surface-2 px-4 text-center">
      <div>
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-full border border-dashed border-line-2 text-[17px] text-line-2">
          ✳
        </div>
        <p className="mt-2 text-[11px] uppercase tracking-[0.13em] text-muted">
          Foto pendiente
        </p>
        <p className="mt-0.5 text-[12px] text-muted">{nombre}</p>
      </div>
    </div>
  );
}

export function FotoProducto({
  producto,
  sizes,
  enTarjeta = false,
}: {
  producto: ProductoVista;
  sizes: string;
  /** Pegada al borde de una tarjeta: la tarjeta recorta las esquinas. */
  enTarjeta?: boolean;
}) {
  // `.media` redondea las cuatro esquinas y, como es CSS sin capa, le gana a
  // cualquier utilidad de Tailwind; por eso aquí se elige una clase u otra.
  const marco = enTarjeta ? "overflow-hidden bg-surface-2" : "media";
  return (
    <div className={`${marco} relative aspect-[4/3]`}>
      {producto.imagen ? (
        <Image
          src={producto.imagen}
          alt={producto.nombre}
          fill
          sizes={sizes}
          className="object-cover"
        />
      ) : (
        <SinFoto nombre={producto.nombre} />
      )}
    </div>
  );
}

/** La ficha técnica: pares etiqueta/valor, acabados y aviso de plano. */
export function FichaProducto({ producto }: { producto: ProductoVista }) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-0">
        {producto.ficha.map(([etiqueta, valor]) => (
          <div
            key={etiqueta}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-line py-2 last:border-b-0"
          >
            <dt className="text-[12.5px] text-muted">{etiqueta}</dt>
            {/* Un valor largo baja a su propio renglón y se lee de izquierda a derecha. */}
            <dd
              className={`text-[13.5px] ${valor.length > 24 ? "basis-full" : "text-right"} ${
                pendiente(valor) ? "text-warm" : "text-ink"
              }`}
            >
              {legible(valor)}
            </dd>
          </div>
        ))}
      </dl>

      {producto.acabados && (
        <div>
          <p className="label">Acabado · eliges uno</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {producto.acabados.map(([nombre, color]) => (
              <li key={nombre} className="flex items-center gap-2.5 text-[13.5px]">
                <span
                  aria-hidden
                  className="h-4 w-4 shrink-0 rounded-full border border-line-2"
                  style={{ background: color }}
                />
                {nombre.replace(/^Opción \d+ · /, "")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {producto.llevaPlano && (
        <p className="text-[12.5px] text-muted">
          Se fabrica sobre medida: tu ficha incluye el plano después del levantamiento
          en obra.
        </p>
      )}
    </div>
  );
}
