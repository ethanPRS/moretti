import Link from "next/link";
import { ContenidoBoton } from "@/components/Boton";

const secciones = [
  { href: "/cotizar", label: "Cotiza" },
  { href: "/#paquetes", label: "Paquetes" },
  { href: "/#como", label: "Cómo funciona" },
];

export default function SitioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-ground/95 backdrop-blur">
        <nav className="mx-auto flex max-w-[1080px] items-center justify-between gap-6 px-7 py-4">
          <Link href="/" className="leading-none">
            <span className="font-display text-[21px] font-bold tracking-[-0.015em]">
              día uno
            </span>
            <span className="mt-0.5 block text-[11px] uppercase tracking-[0.13em] text-muted">
              con Moretti
            </span>
          </Link>
          <div className="flex items-center gap-7 text-[15px]">
            {secciones.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="hidden text-ink-2 hover:text-accent sm:inline"
              >
                {s.label}
              </Link>
            ))}
            <Link href="/cotizar" className="btn btn-sm">
              <ContenidoBoton texto="Cotizar mi depa" />
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line py-9">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-end justify-between gap-6 px-7 text-sm text-muted">
          <div>
            <p className="font-display text-[19px] font-bold text-ink">día uno</p>
            <p className="mt-1">Barrio Roble · Barrio Santa Lucía · Monterrey</p>
          </div>
          <p className="max-w-[46ch] text-[13px]">
            Moretti fabrica, instala, garantiza y factura. día uno presenta el programa,
            estructura el plan y da seguimiento a la cobranza.
          </p>
          {/* Acceso discreto al back office — sólo para el equipo interno */}
          <Link
            href="/admin/login"
            className="inline-flex items-center gap-1.5 text-[12px] text-muted/60 hover:text-accent transition-colors duration-200"
            aria-label="Acceso interno al back office"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.75"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
            Acceso interno
          </Link>
        </div>
      </footer>
    </div>
  );
}
