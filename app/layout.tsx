import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Casa Lista — Prototipo",
  description: "Motor financiero y expediente por unidad (prototipo académico)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <header className="border-b border-zinc-200 bg-white">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4 text-sm font-medium">
            <Link href="/" className="font-semibold text-zinc-900">
              Casa Lista · Prototipo
            </Link>
            <Link href="/proyectos" className="text-zinc-600 hover:text-zinc-900">
              Proyectos
            </Link>
            <Link href="/paquetes" className="text-zinc-600 hover:text-zinc-900">
              Paquetes
            </Link>
          </nav>
        </header>
        <main className="flex-1">
          <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
        </main>
      </body>
    </html>
  );
}
