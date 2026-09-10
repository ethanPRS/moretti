import type { Metadata } from "next";
import { Fraunces, Karla, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const karla = Karla({
  variable: "--font-karla",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "día uno · panel",
  description: "Motor financiero y expediente por unidad · con Moretti",
};

const enlaces = [
  { href: "/", label: "Panel" },
  { href: "/proyectos", label: "Proyectos" },
  { href: "/paquetes", label: "Paquetes" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${fraunces.variable} ${karla.variable} ${plexMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-ground">
          <nav className="mx-auto flex max-w-[1080px] items-center justify-between gap-6 px-7 py-4">
            <Link href="/" className="leading-none">
              <span className="font-display text-[21px] font-bold tracking-[-0.015em]">
                día uno
              </span>
              <span className="mt-0.5 block text-[11px] uppercase tracking-[0.13em] text-muted">
                con Moretti
              </span>
            </Link>
            <div className="flex items-center gap-6 text-[15px]">
              {enlaces.map((e) => (
                <Link key={e.href} href={e.href} className="text-ink-2 hover:text-accent">
                  {e.label}
                </Link>
              ))}
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
      </body>
    </html>
  );
}
