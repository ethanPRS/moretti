"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NuevoProyectoPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const body = {
      desarrolladorNombre: form.get("desarrolladorNombre"),
      nombre: form.get("nombre"),
      numeroUnidades: form.get("numeroUnidades"),
      porcentajeAnticipo: Number(form.get("porcentajeAnticipo")) / 100,
      porcentajeComision: Number(form.get("porcentajeComision")) / 100,
    };
    const res = await fetch("/api/proyectos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Error al crear el proyecto.");
      return;
    }
    const proyecto = await res.json();
    router.push(`/proyectos/${proyecto.id}`);
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold">Nuevo proyecto</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Cada proyecto pertenece a un desarrollador distinto y puede tener sus
        propios porcentajes de anticipo y comisión.
      </p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        <Field label="Nombre del desarrollador" name="desarrolladorNombre" required />
        <Field label="Nombre del proyecto" name="nombre" required />
        <Field
          label="Número de unidades"
          name="numeroUnidades"
          type="number"
          required
        />
        <Field
          label="% de anticipo"
          name="porcentajeAnticipo"
          type="number"
          defaultValue="10"
          step="0.01"
          required
        />
        <Field
          label="% de comisión"
          name="porcentajeComision"
          type="number"
          step="0.01"
          required
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? "Creando..." : "Crear proyecto"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  step?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        step={step}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      />
    </label>
  );
}
