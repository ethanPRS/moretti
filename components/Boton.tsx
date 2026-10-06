import Link from "next/link";

type Variante = "primario" | "secundario" | "claro" | "calido";

const CLASES: Record<Variante, string> = {
  primario: "btn",
  secundario: "btn btn-ghost",
  claro: "btn btn-claro",
  calido: "btn btn-warm",
};

/** El contenido de un botón con la rueda de texto y, si se pide, la flecha. */
export function ContenidoBoton({ texto, flecha }: { texto: string; flecha?: boolean }) {
  return (
    <>
      <span className="btn-texto">
        <span data-text={texto}>{texto}</span>
      </span>
      {flecha && (
        <span className="btn-flecha" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M4 12h15m0 0-6-6m6 6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
    </>
  );
}

/** Un enlace con aspecto de botón. Para los <button> con lógica, usar ContenidoBoton dentro. */
export default function Boton({
  href,
  children,
  variante = "primario",
  flecha = false,
  chico = false,
  className = "",
}: {
  href: string;
  children: string;
  variante?: Variante;
  flecha?: boolean;
  chico?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`${CLASES[variante]}${chico ? " btn-sm" : ""} ${className}`.trim()}
    >
      <ContenidoBoton texto={children} flecha={flecha} />
    </Link>
  );
}
