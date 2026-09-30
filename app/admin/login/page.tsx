"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/admin";

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Animación de entrada con delay pequeño
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const fd = new FormData(e.currentTarget);
    const contrasena = fd.get("contrasena") as string;

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contrasena }),
      });
      const data = await res.json();

      if (data.ok) {
        router.push(next);
        router.refresh();
      } else {
        setError(data.error ?? "Error al iniciar sesión.");
        inputRef.current?.focus();
      }
    } catch {
      setError("No se pudo conectar. Intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .login-card-wrap {
            opacity: 0;
            transform: translateY(22px);
            transition: opacity 0.65s cubic-bezier(0.22, 0.61, 0.36, 1),
                        transform 0.65s cubic-bezier(0.22, 0.61, 0.36, 1);
          }
          .login-card-wrap.visible {
            opacity: 1;
            transform: none;
          }
          .login-logo {
            opacity: 0;
            transition: opacity 0.5s ease;
            transition-delay: 0.1s;
          }
          .login-logo.visible {
            opacity: 1;
          }
          .shake {
            animation: shake 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97);
          }
          @keyframes shake {
            10%, 90% { transform: translateX(-2px); }
            20%, 80% { transform: translateX(3px); }
            30%, 50%, 70% { transform: translateX(-4px); }
            40%, 60% { transform: translateX(4px); }
          }
        }
        .login-bg {
          background: var(--ground);
          position: relative;
        }
        .login-bg::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(
            ellipse 80% 60% at 50% -10%,
            color-mix(in srgb, var(--accent) 8%, transparent),
            transparent 70%
          );
          pointer-events: none;
        }
        .login-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--muted);
          font-size: 12px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin: 20px 0;
        }
        .login-divider::before,
        .login-divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: var(--line);
        }
        .pw-wrap {
          position: relative;
        }
        .pw-wrap input {
          padding-right: 44px;
        }
        .pw-toggle {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: var(--muted);
          padding: 4px;
          border-radius: 4px;
          line-height: 0;
          transition: color 0.2s;
        }
        .pw-toggle:hover { color: var(--accent); }
        .error-msg {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          background: var(--warm-soft);
          border-left: 3px solid var(--warm);
          border-radius: 0 8px 8px 0;
          padding: 12px 14px;
          font-size: 13.5px;
          color: var(--ink-2);
          margin-top: 16px;
        }
        .error-icon {
          flex-shrink: 0;
          color: var(--warm);
          margin-top: 1px;
        }
        .spin {
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--muted);
          text-decoration: none;
          transition: color 0.2s;
          margin-bottom: 28px;
        }
        .back-link:hover { color: var(--accent); }
        .badge-admin {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: var(--accent-soft);
          color: var(--accent);
          border-radius: 999px;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 3px 10px;
          margin-bottom: 12px;
        }
        .badge-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }
      `}</style>

      <div
        className="login-bg grid min-h-full place-items-center px-6 py-16"
        aria-label="Acceso al back office"
      >
        <div className={`login-card-wrap w-full max-w-[400px] ${visible ? "visible" : ""}`}>
          {/* Logo + back */}
          <div className={`login-logo ${visible ? "visible" : ""}`}>
            <Link href="/" className="back-link" aria-label="Volver al sitio">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Volver al sitio
            </Link>

            <Link href="/" className="block mb-6">
              <span className="font-display text-[28px] font-bold tracking-[-0.02em] text-ink leading-none">
                día uno
              </span>
              <span className="block mt-1 text-[11px] uppercase tracking-[0.15em] text-muted">
                con Moretti
              </span>
            </Link>
          </div>

          {/* Tarjeta */}
          <article className="card p-8">
            <div className="badge-admin">
              <span className="badge-dot" aria-hidden="true" />
              Acceso interno
            </div>

            <h1 className="text-[22px] font-semibold leading-tight mb-1">
              Entra al back office
            </h1>
            <p className="text-sm text-muted mb-6">
              Solo para el equipo de día uno · Moretti · PISSA
            </p>

            <form onSubmit={onSubmit} noValidate aria-label="Formulario de acceso">
              <div className="field">
                <label htmlFor="contrasena-admin">Contraseña</label>
                <div className="pw-wrap">
                  <input
                    ref={inputRef}
                    type="password"
                    id="contrasena-admin"
                    name="contrasena"
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    required
                    aria-required="true"
                    aria-describedby={error ? "login-error" : undefined}
                    aria-invalid={error ? "true" : undefined}
                    disabled={cargando}
                  />
                  <button
                    type="button"
                    className="pw-toggle"
                    aria-label="Mostrar u ocultar contraseña"
                    tabIndex={0}
                    onClick={() => {
                      const el = inputRef.current;
                      if (el) el.type = el.type === "password" ? "text" : "password";
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M1 12C1 12 5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" strokeWidth="1.75"/>
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75"/>
                    </svg>
                  </button>
                </div>
              </div>

              {error && (
                <div
                  id="login-error"
                  className="error-msg shake"
                  role="alert"
                  aria-live="assertive"
                >
                  <svg className="error-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75"/>
                    <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                id="btn-entrar"
                className="btn w-full mt-6"
                disabled={cargando}
                aria-disabled={cargando}
              >
                {cargando ? (
                  <>
                    <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="40 20" strokeLinecap="round"/>
                    </svg>
                    Entrando…
                  </>
                ) : (
                  "Entrar al panel"
                )}
              </button>
            </form>
          </article>

          {/* Nota de prototipo */}
          <p className="mt-5 text-center text-[12px] text-muted leading-relaxed">
            Ambiente de pruebas · ningún dato real · prototipo académico
          </p>
        </div>
      </div>
    </>
  );
}
