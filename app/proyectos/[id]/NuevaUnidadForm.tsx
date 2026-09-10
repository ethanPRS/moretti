"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NuevaUnidadForm({
  proyectoId,
  prototipos,
}: {
  proyectoId: string;
  prototipos: { id: string; clave: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/unidades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proyectoId,
        prototipoId: form.get("prototipoId"),
        torre: form.get("torre"),
        numero: form.get("numero"),
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Error al crear la unidad.");
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  if (prototipos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
        Crea al menos un prototipo para poder dar de alta unidades.
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex max-w-xl flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-700">Torre</span>
        <input
          name="torre"
          required
          className="w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-700">Número</span>
        <input
          name="numero"
          required
          className="w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-700">Prototipo</span>
        <select
          name="prototipoId"
          required
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">…</option>
          {prototipos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.clave}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Agregar unidad
      </button>
    </form>
  );
}
