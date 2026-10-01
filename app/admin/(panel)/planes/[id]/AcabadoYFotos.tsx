"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/admin/avisar";

type Opcion = [nombre: string, color: string];

const corto = (acabado: string) => acabado.replace(/^Opción \d+ · /, "");

/**
 * El acabado y las fotos de referencia de una partida del plan (S1-05). Todo
 * lo valida el motor —tipo, tamaño, máximo de dos, R6—; aquí sólo se muestra
 * lo que contesta.
 */
export default function AcabadoYFotos({
  renglonId,
  nombre,
  opciones,
  elegido,
  fotos,
  bloqueo,
}: {
  renglonId: string;
  nombre: string;
  opciones: Opcion[] | null;
  elegido: string | null;
  fotos: { id: string; nombre: string }[];
  /** Por qué ya no se puede cambiar, o null si todavía se puede. */
  bloqueo: string | null;
}) {
  const router = useRouter();
  const archivo = useRef<HTMLInputElement>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(peticion: Promise<Response>) {
    setError(null);
    setTrabajando(true);
    const res = await peticion.catch(() => null);
    setTrabajando(false);
    if (!res || !res.ok) {
      const data = await res?.json().catch(() => ({}));
      const msg = data?.error ?? "No se pudo guardar. Revisa la conexión y vuelve a intentar.";
      avisar.error(msg);
      setError(msg);
      return;
    }
    avisar.exito("Cambios guardados.");
    router.refresh();
  }

  function elegir(acabado: string) {
    if (acabado === elegido) return;
    enviar(
      fetch(`/api/renglones/${renglonId}/acabado`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acabado }),
      })
    );
  }

  function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const foto = e.target.files?.[0];
    e.target.value = "";
    if (!foto) return;
    const cuerpo = new FormData();
    cuerpo.set("foto", foto);
    enviar(fetch(`/api/renglones/${renglonId}/fotos`, { method: "POST", body: cuerpo }));
  }

  function quitar(fotoId: string) {
    enviar(fetch(`/api/fotos/${fotoId}`, { method: "DELETE" }));
  }

  const deshabilitado = trabajando || bloqueo !== null;

  return (
    <div className="card flex flex-col gap-4 p-5">
      <p className="font-medium">{nombre}</p>

      {opciones ? (
        <fieldset disabled={deshabilitado}>
          <legend className="label mb-2">Acabado · se elige uno</legend>
          <div className="flex flex-wrap gap-2">
            {opciones.map(([opcion, color]) => {
              const activo = opcion === elegido;
              return (
                <button
                  key={opcion}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => elegir(opcion)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    activo
                      ? "border-accent bg-accent-soft font-semibold text-accent"
                      : "border-line-2 bg-surface text-ink-2 hover:bg-surface-2"
                  }`}
                >
                  <span aria-hidden className="h-3.5 w-3.5 rounded-full border border-line-2" style={{ background: color }} />
                  {corto(opcion)}
                </button>
              );
            })}
          </div>
          {!elegido && <p className="mt-1.5 text-[12.5px] text-warm">Falta elegir el acabado.</p>}
        </fieldset>
      ) : (
        <p className="text-[12.5px] text-muted">Sin opciones de acabado.</p>
      )}

      <div>
        <p className="label mb-2">Fotos de referencia · hasta dos</p>
        <div className="flex flex-wrap items-center gap-3">
          {fotos.map((f) => (
            <figure key={f.id} className="flex flex-col items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- la sirve /api/fotos, no es estática */}
              <img
                src={`/api/fotos/${f.id}`}
                alt={`Foto de referencia: ${f.nombre}`}
                className="h-20 w-20 rounded-img border border-line object-cover"
              />
              {bloqueo === null && (
                <button
                  type="button"
                  onClick={() => quitar(f.id)}
                  disabled={trabajando}
                  className="text-[12px] text-warm hover:underline disabled:opacity-50"
                >
                  Quitar
                </button>
              )}
            </figure>
          ))}
          {/* Spec §4: el botón de subir desaparece al llegar a dos. */}
          {fotos.length < 2 && bloqueo === null && (
            <>
              <input
                ref={archivo}
                type="file"
                accept="image/jpeg,image/png"
                onChange={subir}
                className="hidden"
                aria-label={`Subir foto de referencia de ${nombre}`}
              />
              <button
                type="button"
                onClick={() => archivo.current?.click()}
                disabled={trabajando}
                className="grid h-20 w-20 place-items-center rounded-img border border-dashed border-line-2 text-center text-[12px] text-muted hover:bg-surface-2 disabled:opacity-50"
              >
                {trabajando ? "Subiendo…" : "+ Subir foto"}
              </button>
            </>
          )}
          {fotos.length === 0 && bloqueo !== null && <p className="text-[12.5px] text-muted">Sin fotos.</p>}
        </div>
        {bloqueo === null && <p className="mt-1.5 text-[12px] text-muted">JPG o PNG, hasta 5 MB cada una.</p>}
      </div>

      {bloqueo && <p className="text-[12.5px] text-ink-2">{bloqueo}</p>}
      {error && (
        <p role="alert" className="text-[13px] text-warm">
          {error}
        </p>
      )}
    </div>
  );
}
