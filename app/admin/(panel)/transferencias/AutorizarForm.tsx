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
    <div className="bo-autoriza">
      {confirmar ? (
        <>
          <p className="text-[13px] text-ink-2">
            <b>{quien}</b> autoriza pagar <b>{neto}</b> a Moretti. ¿Seguimos?
          </p>
          <button type="button" onClick={enviar} disabled={cargando} className="btn btn-sm">
            {cargando ? "Transfiriendo…" : `Sí, transferir ${neto}`}
          </button>
          <button type="button" onClick={() => setConfirmar(false)} disabled={cargando} className="btn btn-sm btn-ghost">
            Cancelar
          </button>
        </>
      ) : (
        <form
          className="bo-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (quien.trim()) setConfirmar(true);
          }}
        >
          <input value={quien} onChange={(e) => setQuien(e.target.value)} placeholder="¿Quién autoriza?" aria-label="Quién autoriza" />
          <button disabled={!quien.trim()}>Pagar a Moretti</button>
        </form>
      )}
    </div>
  );
}
