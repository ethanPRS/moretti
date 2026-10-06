"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/admin/avisar";

export default function ContratoForm({ unidadId }: { unidadId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/contratos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unidadId,
        archivoNombre: f.get("archivoNombre"),
        quienFirmo: f.get("quienFirmo"),
        fechaFirma: f.get("fechaFirma"),
      }),
    });
    setCargando(false);
    if (!res.ok) {
      const data = await res.json();
      const msg = data.error ?? "No se pudo registrar el contrato.";
      avisar.error(msg);
      setError(msg);
      return;
    }
    avisar.exito("Contrato registrado. Ya se puede cobrar el anticipo.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-4 p-6">
      <div>
        <p className="label">Registrar contrato firmado</p>
        <p className="mt-2 text-[13.5px] text-ink-2">
          El contrato de compraventa es con Moretti. Sin su registro, el sistema no deja cobrar.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <input name="archivoNombre" placeholder="Archivo (ej. contrato-717.pdf)" required />
        <input name="quienFirmo" placeholder="Quién firmó" required />
        <input name="fechaFirma" type="date" required />
      </div>
      {error && <p className="text-[13px] text-warm">{error}</p>}
      <button disabled={cargando} className="btn self-start">
        {cargando ? "Registrando…" : "Registrar contrato"}
      </button>
    </form>
  );
}
