"use client";

import { useEffect, useState } from "react";
import { escucharAvisos, type Aviso } from "./avisar";

const DURACION_MS = 4200;

/** La pila de avisos, abajo a la derecha. Los errores se quedan hasta cerrarlos. */
export default function Avisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  useEffect(
    () =>
      escucharAvisos((a) => {
        setAvisos((lista) => [...lista.slice(-2), a]);
        if (a.tipo === "exito") {
          setTimeout(() => setAvisos((lista) => lista.filter((x) => x.id !== a.id)), DURACION_MS);
        }
      }),
    []
  );

  const cerrar = (id: number) => setAvisos((lista) => lista.filter((x) => x.id !== id));

  return (
    <div className="avisos" aria-live="polite" aria-atomic="false">
      {avisos.map((a) => (
        <div key={a.id} className="aviso" data-tipo={a.tipo} role={a.tipo === "error" ? "alert" : "status"}>
          <span className="aviso-icono" aria-hidden="true">
            {a.tipo === "exito" ? (
              <svg viewBox="0 0 24 24" fill="none">
                <path className="aviso-trazo" d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none">
                <path className="aviso-trazo" d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
              </svg>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="aviso-titulo">{a.tipo === "exito" ? "Listo" : "No se pudo guardar"}</p>
            <p className="aviso-texto">{a.texto}</p>
          </div>
          <button type="button" className="aviso-cerrar" onClick={() => cerrar(a.id)} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
