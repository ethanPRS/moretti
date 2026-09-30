import type { Metadata } from "next";
import Link from "next/link";
import { BtnSalir } from "@/components/admin/BtnSalir";

export const metadata: Metadata = {
  title: "día uno · back office",
};

const enlaces = [
  { href: "/admin", label: "Cartera" },
  { href: "/admin/pagos", label: "Pagos" },
  { href: "/admin/proyectos", label: "Proyectos" },
  { href: "/admin/catalogo", label: "Paquetes" },
];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-ground">
        <nav className="mx-auto flex max-w-[1080px] items-center justify-between gap-6 px-7 py-4">
          <Link href="/admin" className="leading-none">
            <span className="font-display text-[21px] font-bold tracking-[-0.015em]">
              día uno
            </span>
            <span className="mt-0.5 block text-[11px] uppercase tracking-[0.13em] text-muted">
              back office
            </span>
          </Link>
          <div className="flex items-center gap-6 text-[15px]">
            {enlaces.map((e) => (
              <Link key={e.href} href={e.href} className="text-ink-2 hover:text-accent">
                {e.label}
              </Link>
            ))}
            <Link href="/" className="text-muted hover:text-accent">
              Ver sitio
            </Link>
            <BtnSalir />
          </div>
        </nav>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-[1080px] px-7 py-12">{children}</div>
      </main>
      <footer className="border-t border-line py-7 text-sm text-muted">
        <div className="mx-auto max-w-[1080px] px-7">
          Prototipo académico · ambiente de pruebas · ningún dato real
        </div>
      </footer>
    </div>
  );
}
