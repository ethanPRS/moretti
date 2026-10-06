"use client";

import { useRef, useState } from "react";
import { avisar } from "@/components/admin/avisar";

/**
 * Elegir o arrastrar una imagen: se sube en cuanto se elige y el formulario
 * recibe la dirección en un campo oculto (`name`). Muestra la vista previa.
 */
export default function SubirImagen({
  name,
  inicial,
  etiqueta = "Imagen",
  ayuda,
  onCambio,
}: {
  name?: string;
  inicial?: string | null;
  etiqueta?: string;
  ayuda?: string;
  onCambio?: (url: string | null) => void;
}) {
  const [url, setUrl] = useState<string | null>(inicial ?? null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encima, setEncima] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    setSubiendo(true);
    const datos = new FormData();
    datos.append("archivo", archivo);
    const res = await fetch("/api/imagenes", { method: "POST", body: datos });
    const r = await res.json().catch(() => ({}));
    setSubiendo(false);
    if (!res.ok) {
      const msg = r.error ?? "No se pudo subir la imagen.";
      avisar.error(msg);
      return setError(msg);
    }
    setUrl(r.url);
    avisar.exito("Imagen subida. Guarda los cambios para aplicarla.");
    onCambio?.(r.url);
  }

  function quitar() {
    setUrl(null);
    onCambio?.(null);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="field">
      <span>{etiqueta}</span>
      {name && <input type="hidden" name={name} value={url ?? ""} />}
      <div
        className="subir-imagen"
        data-encima={encima ? "" : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault();
          setEncima(false);
          subir(e.dataTransfer.files[0]);
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Vista previa" className="h-28 w-40 rounded-[10px] object-cover" />
        ) : (
          <div className="grid h-28 w-40 place-items-center rounded-[10px] bg-surface-2 text-[12px] text-muted">
            Sin imagen
          </div>
        )}
        <div className="flex flex-col items-start gap-2">
          <p className="text-[13.5px] text-ink-2">
            {subiendo ? "Subiendo…" : "Arrastra una imagen aquí o elige un archivo."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current?.click()} disabled={subiendo}>
              {url ? "Cambiar imagen" : "Subir imagen"}
            </button>
            {url && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={quitar} disabled={subiendo}>
                Quitar
              </button>
            )}
          </div>
          <p className="ayuda">{ayuda ?? "JPG, PNG o WebP de hasta 8 MB. Horizontal, de preferencia 1600 px de ancho."}</p>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => subir(e.target.files?.[0])}
        />
      </div>
      {error && <p className="mt-1.5 text-[13px] text-warm" role="alert">{error}</p>}
    </div>
  );
}
