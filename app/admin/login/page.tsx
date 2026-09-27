import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Acceso interno · día uno",
};

/**
 * Dónde va a vivir el acceso al back office. Todavía no autentica: la
 * autenticación y los roles quedaron fuera del MVP (plan, sección 04).
 *
 * Está fuera del grupo (panel) a propósito: así no hereda la navegación del
 * back office, y cuando llegue la autenticación basta una sola regla en el
 * proxy —todo /admin salvo /admin/login pide sesión— para cerrar el panel
 * entero sin tocar página por página.
 */
export default function AdminLoginPage() {
  return (
    <div className="grid min-h-full place-items-center px-7 py-16">
      <div className="w-full max-w-[380px]">
        <Link href="/" className="block text-center leading-none">
          <span className="font-display text-[26px] font-bold tracking-[-0.015em]">
            día uno
          </span>
          <span className="mt-1 block text-[11px] uppercase tracking-[0.13em] text-muted">
            back office
          </span>
        </Link>

        <div className="card mt-8 p-8">
          <p className="eyebrow">Acceso interno</p>
          <h1 className="mt-2 text-[24px]">Entra a tu cuenta</h1>

          <form className="mt-6 flex flex-col gap-5" aria-describedby="aviso-acceso">
            <div className="field">
              <label htmlFor="correo">Correo</label>
              <input
                type="email"
                id="correo"
                placeholder="nombre@diauno.mx"
                autoComplete="username"
                disabled
              />
            </div>
            <div className="field">
              <label htmlFor="contrasena">Contraseña</label>
              <input
                type="password"
                id="contrasena"
                autoComplete="current-password"
                disabled
              />
            </div>
            <button type="button" className="btn w-full" disabled>
              Entrar
            </button>
          </form>

          <p id="aviso-acceso" className="note blocked mt-6">
            <b>Todavía no autentica.</b> El acceso con cuenta y roles quedó fuera del MVP.
            Mientras tanto el panel está abierto, sólo con datos de prueba.
          </p>

          <Link href="/admin" className="btn btn-ghost mt-4 w-full text-center">
            Entrar al panel de prueba →
          </Link>
        </div>

        <p className="mt-6 text-center text-[13px] text-muted">
          Una sola entrada para todos. Después de entrar, cada quien ve lo suyo: día
          uno la operación completa, Moretti su producción y PISSA sus unidades.
        </p>
      </div>
    </div>
  );
}
