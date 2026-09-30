"use client";

import { useRouter } from "next/navigation";

/**
 * Botón de cierre de sesión del back office.
 * Llama a POST /api/admin/logout y redirige a /admin/login.
 */
export function BtnSalir() {
  const router = useRouter();

  async function salir() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      id="btn-salir"
      onClick={salir}
      className="panel-enlace panel-enlace-suave w-full"
      aria-label="Cerrar sesión del back office"
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-[18px] w-[18px] shrink-0">
        <path d="M15 4h4.5v16H15M10 8l-4 4 4 4M6 12h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Salir
    </button>
  );
}
