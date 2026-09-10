"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NuevoPaqueteForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/paquetes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nivel: form.get("nivel"),
        nombre: form.get("nombre"),
        partidas: form.get("partidas"),
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Error al crear el paquete.");
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex max-w-xl flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4"
    >
      <h2 className="font-medium">Nuevo paquete</h2>
      <div className="flex gap-3">
        <input
          name="nivel"
          type="number"
          placeholder="Nivel (1-4)"
          required
          className="w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <input
          name="nombre"
          placeholder="Nombre (ej. Cocina + Clósets)"
          required
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>
      <input
        name="partidas"
        placeholder="Partidas separadas por coma (ej. Cocina, Clósets, Clima)"
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Agregar paquete
      </button>
    </form>
  );
}
