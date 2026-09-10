"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegistrarCompradorForm({
  unidadId,
  paquetes,
}: {
  unidadId: string;
  paquetes: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/compradores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: form.get("nombre"),
        contacto: form.get("contacto"),
        unidadId,
        paqueteId: form.get("paqueteId"),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Error al registrar al comprador.");
      return;
    }
    const data = await res.json();
    router.push(`/planes/${data.plan.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-700">Nombre del comprador</span>
        <input
          name="nombre"
          required
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-700">Contacto (teléfono o correo)</span>
        <input
          name="contacto"
          required
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-700">Paquete</span>
        <select
          name="paqueteId"
          required
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">…</option>
          {paquetes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {loading ? "Generando plan..." : "Registrar y generar plan"}
      </button>
    </form>
  );
}
