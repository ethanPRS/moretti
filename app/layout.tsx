import type { Metadata } from "next";
import { Poppins, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "día uno · con Moretti",
  description:
    "Cocina, clósets y clima instalados el día que recibes llaves. Lo pagas en mensualidades fijas mientras se construye.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${poppins.variable} ${plexMono.variable} h-full`}
      // Extensiones como Grammarly agregan atributos a <html> y <body> antes
      // de que React hidrate. Esto sólo ignora atributos de estas dos
      // etiquetas; un desajuste dentro de la página sí se sigue reportando.
      suppressHydrationWarning
    >
      <body className="min-h-full" suppressHydrationWarning>
        {/* Sin JS no hay quién revele: se muestra todo de una vez. */}
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        {children}
      </body>
    </html>
  );
}
