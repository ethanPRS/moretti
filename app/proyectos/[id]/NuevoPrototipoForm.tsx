"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NuevoPrototipoForm({ proyectoId }: { proyectoId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/prototipos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proyectoId,
        clave: form.get("clave"),
        superficie: form.get("superficie"),
        recamaras: form.get("recamaras"),
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Error al crear el prototipo.");
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4"
    >
      <h3 className="text-sm font-medium">Nuevo prototipo</h3>
      <input
        name="clave"
        placeholder="Clave (ej. A2)"
        required
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-3">
        <input
          name="superficie"
          type="number"
          step="0.01"
          placeholder="Superficie m²"
          required
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <input
          name="recamaras"
          type="number"
          placeholder="Recámaras"
          required
          className="w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Agregar prototipo
      </button>
    </form>
  );
}
