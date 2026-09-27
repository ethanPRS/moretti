"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 200 cobrado · 202 pendiente (el banco pidió autenticación) · 402 rechazado.
 * En los tres casos se refresca: la bitácora ya trae lo que pasó.
 */
export default function CobrarButton({
  exhibicionId,
  esAnticipo,
  bloqueado,
}: {
  exhibicionId: string;
  esAnticipo: boolean;
  bloqueado: boolean;
}) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; tipo: "error" | "info" } | null>(null);

  async function cobrar() {
    setAviso(null);
    setCargando(true);
    const res = await fetch(`/api/exhibiciones/${exhibicionId}/cobrar`, { method: "POST" });
    setCargando(false);
    const data = await res.json().catch(() => ({}));
    if (res.status === 202) {
      setAviso({ texto: data.mensaje ?? "El cobro quedó pendiente.", tipo: "info" });
    } else if (!res.ok) {
      setAviso({ texto: data.error ?? "No se pudo cobrar.", tipo: "error" });
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={cobrar} disabled={cargando || bloqueado} className="btn btn-sm">
        {cargando ? "Cobrando…" : esAnticipo ? "Cobrar anticipo" : "Cobrar"}
      </button>
      {aviso && (
        <span
          role={aviso.tipo === "error" ? "alert" : "status"}
          className={`max-w-[34ch] text-right text-[12px] ${aviso.tipo === "error" ? "text-warm" : "text-ink-2"}`}
        >
          {aviso.texto}
        </span>
      )}
    </div>
  );
}
