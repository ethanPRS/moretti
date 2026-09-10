"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NuevoPrecioForm({
  prototipos,
  paquetes,
}: {
  prototipos: { id: string; clave: string }[];
  paquetes: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/precios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prototipoId: form.get("prototipoId"),
        paqueteId: form.get("paqueteId"),
        monto: form.get("monto"),
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Error al crear el precio.");
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  if (prototipos.length === 0 || paquetes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
        Crea al menos un prototipo y un paquete (en /paquetes) para poder
        cargar precios.
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4"
    >
      <h3 className="text-sm font-medium">Nuevo precio</h3>
      <select
        name="prototipoId"
        required
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
      >
        <option value="">Prototipo…</option>
        {prototipos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.clave}
          </option>
        ))}
      </select>
      <select
        name="paqueteId"
        required
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
      >
        <option value="">Paquete…</option>
        {paquetes.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
      <input
        name="monto"
        type="number"
        step="0.01"
        placeholder="Monto total"
        required
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-zinc-400">
        Si ya había un precio vigente para esa combinación, se cierra
        automáticamente (queda su histórico) y este nuevo se vuelve el
        vigente.
      </p>
      <button
        type="submit"
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Guardar precio
      </button>
    </form>
  );
}
