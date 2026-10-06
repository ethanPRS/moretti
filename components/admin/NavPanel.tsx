"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BtnSalir } from "./BtnSalir";

const ICONOS = {
  inicio: "M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10",
  cartera: "M4 6.5h16v12H4zM4 10h16M8 14.5h3",
  pagos: "M3.5 7h17v10h-17zM3.5 10.5h17M7 14h4",
  fiscal: "M6.5 3.5h8l3 3v14h-11zM14.5 3.5v3h3M9 11h6M9 14.5h6M9 18h3",
  proyectos: "M4.5 20V6.5L12 3l7.5 3.5V20M9 20v-5h6v5M9 9.5h.01M15 9.5h.01",
  paquetes: "M4 8l8-4 8 4-8 4-8-4zM4 8v8l8 4 8-4V8M12 12v8",
} as const;

const ENLACES: { href: string; texto: string; icono: keyof typeof ICONOS; exacto?: boolean }[] = [
  { href: "/admin", texto: "Inicio", icono: "inicio", exacto: true },
  { href: "/admin/proyectos", texto: "Proyectos", icono: "proyectos" },
  { href: "/admin/catalogo", texto: "Paquetes", icono: "paquetes" },
  { href: "/admin/pagos", texto: "Pagos", icono: "pagos" },
  { href: "/admin/fiscal", texto: "Fiscal", icono: "fiscal" },
];

function Icono({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-[18px] w-[18px] shrink-0">
      <path d={d} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function NavPanel() {
  const ruta = usePathname();
  const activo = (href: string, exacto?: boolean) =>
    exacto ? ruta === href : ruta === href || ruta.startsWith(`${href}/`);

  return (
    <aside className="panel-lateral">
      <Link href="/admin" className="panel-marca">
        <span className="font-display text-[22px] font-bold tracking-[-0.02em]">día uno</span>
        <span className="block font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">back office</span>
      </Link>

      <nav className="panel-nav" aria-label="Secciones del back office">
        {ENLACES.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            className="panel-enlace"
            aria-current={activo(e.href, e.exacto) ? "page" : undefined}
          >
            <Icono d={ICONOS[e.icono]} />
            {e.texto}
          </Link>
        ))}
      </nav>

      <div className="panel-pie">
        <Link href="/" className="panel-enlace panel-enlace-suave">
          <Icono d="M14 4h6v6M20 4l-9 9M18 14v5.5H4.5V6H10" />
          Ver sitio
        </Link>
        <BtnSalir />
      </div>
    </aside>
  );
}
