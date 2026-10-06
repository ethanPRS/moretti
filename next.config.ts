import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/**
 * Política de contenido (auditoría 6 oct, H-5). Sólo el propio sitio y
 * Stripe (Payment Element: script, iframes y API). Las fuentes las sirve
 * next/font desde el mismo sitio. 'unsafe-inline' en scripts lo exige Next
 * sin nonces; el riesgo que queda está en docs/seguridad.md. En desarrollo
 * se permite 'unsafe-eval' y el websocket de recarga.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.stripe.com",
  "font-src 'self'",
  `connect-src 'self' https://api.stripe.com https://*.stripe.com${dev ? " ws: wss:" : ""}`,
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

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
      { key: "Content-Security-Policy", value: CSP },
      // Sólo HTTPS durante dos años, una vez que el navegador lo vio (no en local).
      ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
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
