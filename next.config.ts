import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No revelar la tecnología del servidor en la cabecera X-Powered-By
  poweredByHeader: false,

  async headers() {

    const base = [
      // Nadie mete el sitio en un iframe ajeno (clickjacking).
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    return [
      { source: "/:ruta*", headers: base },
      {
        // El back office no se indexa ni se guarda en cachés compartidas.
        source: "/admin/:ruta*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // El back office vivía en la raíz; ahora todo va bajo /admin.
      { source: "/panel", destination: "/admin", permanent: false },
      { source: "/proyectos/:ruta*", destination: "/admin/proyectos/:ruta*", permanent: false },
      { source: "/planes/:ruta*", destination: "/admin/planes/:ruta*", permanent: false },
      { source: "/unidades/:ruta*", destination: "/admin/unidades/:ruta*", permanent: false },
      // /paquetes a secas no es una página: los paquetes se listan en el inicio.
      { source: "/paquetes", destination: "/#paquetes", permanent: false },
    ];
  },
};

export default nextConfig;
