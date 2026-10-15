import Link from "next/link";
import { ContenidoBoton } from "@/components/Boton";
import "./sitio.css";

/** Menú y pie de la maqueta de Ana Cris (5b). */
export default function SitioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="m5b flex min-h-full flex-col">
      <nav className="m5b-nav">
        <div className="wrap">
          <Link href="/" aria-label="día uno, inicio">
            <div className="brand">
              dia<em>´</em>uno
            </div>
          </Link>
          <div className="nav-links">
            <Link href="/#calc" className="hidden sm:inline">Cotiza tu depa</Link>
            <Link href="/#paquetes" className="hidden sm:inline">Paquetes</Link>
            <Link href="/#como" className="hidden sm:inline">Cómo funciona</Link>
            <Link href="/admin/login" className="btn btn-bo">
              <ContenidoBoton texto="Back office" />
            </Link>
            <Link href="/#registro" className="btn">
              <ContenidoBoton texto="Apartar" />
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1">{children}</main>

      <footer className="m5b-pie">
        <div className="wrap">
          <div>
            <b>día uno</b> · con Moretti · Monterrey
          </div>
          <div>Prototipo · octubre 2026</div>
        </div>
      </footer>
    </div>
  );
}
