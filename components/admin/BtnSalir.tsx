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
      className="text-muted hover:text-warm transition-colors duration-200 text-[14px]"
      aria-label="Cerrar sesión del back office"
    >
      Salir
    </button>
  );
}
