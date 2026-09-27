import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
