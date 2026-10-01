import type { Metadata } from "next";
import NavPanel from "@/components/admin/NavPanel";
import Avisos from "@/components/admin/Avisos";
import "./panel.css";

export const metadata: Metadata = {
  title: "día uno · back office",
  robots: { index: false, follow: false },
};

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel">
      <NavPanel />
      <main className="panel-contenido">
        <div className="mx-auto w-full max-w-[1120px] px-5 py-10 sm:px-10 sm:py-14">{children}</div>
        <footer className="mx-auto w-full max-w-[1120px] px-5 pb-8 text-[12.5px] text-muted sm:px-10">
          Prototipo académico · ambiente de pruebas · ningún dato real
        </footer>
      </main>
      <Avisos />
    </div>
  );
}
