"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/admin/avisar";

/** Cierra el pendiente con el folio fiscal (UUID del CFDI). */
export default function EmitirForm({ id }: { id: string }) {
  const router = useRouter();
  const [folio, setFolio] = useState("");
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    const res = await fetch(`/api/comprobantes/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folioFiscal: folio }),
    });
    setCargando(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return avisar.error(data.error ?? "No se pudo cerrar el comprobante.");
    avisar.exito("Comprobante emitido.");
    setFolio("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="bo-form">
      <input
        value={folio}
        onChange={(e) => setFolio(e.target.value)}
        placeholder="Folio fiscal (UUID)"
        aria-label="Folio fiscal"
        className="font-mono"
        required
      />
      <button disabled={cargando || !folio}>{cargando ? "Guardando…" : "Marcar emitido"}</button>
    </form>
  );
}
