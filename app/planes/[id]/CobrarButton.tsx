"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const [error, setError] = useState<string | null>(null);

  async function cobrar() {
    setError(null);
    setCargando(true);
    const res = await fetch(`/api/exhibiciones/${exhibicionId}/cobrar`, { method: "POST" });
    setCargando(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "No se pudo cobrar.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={cobrar} disabled={cargando || bloqueado} className="btn btn-sm">
        {cargando ? "Cobrando…" : esAnticipo ? "Cobrar anticipo" : "Cobrar"}
      </button>
      {error && <span className="max-w-[34ch] text-right text-[12px] text-warm">{error}</span>}
    </div>
  );
}
