import type { Metadata } from "next";
import { Fraunces, Karla, IBM_Plex_Mono } from "next/font/google";
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
  title: "día uno · con Moretti",
  description:
    "Cocina, clósets y clima instalados el día que recibes llaves. Lo pagas en mensualidades fijas mientras se construye.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${fraunces.variable} ${karla.variable} ${plexMono.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
