"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/admin/avisar";

/** Autorizar el pago a Moretti: pide el nombre de quien autoriza y confirma el monto. */
export default function AutorizarForm({ proyectoId, neto }: { proyectoId: string; neto: string }) {
  const router = useRouter();
  const [quien, setQuien] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function enviar() {
    setCargando(true);
    const res = await fetch("/api/transferencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proyectoId, autorizadaPor: quien }),
    });
    setCargando(false);
    setConfirmar(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return avisar.error(data.error ?? "No se pudo transferir.");
    avisar.exito(`Transferencia enviada a Moretti (${data.referencia}).`);
    setQuien("");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input value={quien} onChange={(e) => setQuien(e.target.value)} placeholder="Quién autoriza" aria-label="Quién autoriza" />
      {confirmar ? (
        <>
          <button type="button" onClick={enviar} disabled={cargando} className="btn btn-sm">
            {cargando ? "Transfiriendo…" : `Sí, transferir ${neto}`}
          </button>
          <button type="button" onClick={() => setConfirmar(false)} className="btn btn-sm btn-ghost">
            Cancelar
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirmar(true)} disabled={!quien.trim()} className="btn btn-sm">
          Pagar a Moretti
        </button>
      )}
    </div>
  );
}
