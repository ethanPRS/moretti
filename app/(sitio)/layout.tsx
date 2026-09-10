import Link from "next/link";

const secciones = [
  { href: "#cotiza", label: "Cotiza" },
  { href: "#paquetes", label: "Paquetes" },
  { href: "#como", label: "Cómo funciona" },
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
              <a
                key={s.href}
                href={s.href}
                className="hidden text-ink-2 hover:text-accent sm:inline"
              >
                {s.label}
              </a>
            ))}
            <a href="#cotiza" className="btn btn-sm">
              Cotizar mi depa
            </a>
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
          <Link href="/panel" className="text-[13px] hover:text-accent">
            Acceso interno
          </Link>
        </div>
      </footer>
    </div>
  );
}
