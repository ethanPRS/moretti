"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/admin/avisar";

/**
 * Cobra una mensualidad a la tarjeta guardada, sin el comprador presente
 * (off_session). El motor arma la llave con el intento: volver a picar tras
 * un error de red no cobra dos veces. Si el banco pide autenticación, Stripe
 * lo rechaza como authentication_required y queda en la bitácora.
 */
export default function CobrarMensualidad({ exhibicionId, numero }: { exhibicionId: string; numero: number }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function cobrar() {
    setAviso(null);
    setCargando(true);
    const res = await fetch(`/api/exhibiciones/${exhibicionId}/cobrar`, { method: "POST" }).catch(() => null);
    setCargando(false);
    const data = (await res?.json().catch(() => ({}))) ?? {};

    if (res?.status === 200) {
      avisar.exito(`Mensualidad ${numero} cobrada.`);
    } else if (res?.status === 202) {
      setAviso(data.mensaje ?? "El cobro quedó pendiente; se aplica cuando Stripe lo confirme.");
    } else {
      const mensaje = data.error ?? "No hubo respuesta. Vuelve a intentar: va con la misma llave y no se cobra dos veces.";
      avisar.error(mensaje);
      setAviso(mensaje);
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button type="button" className="btn btn-sm" onClick={cobrar} disabled={cargando}>
        {cargando ? "Cobrando…" : "Cobrar"}
      </button>
      {aviso && (
        <span className="max-w-[34ch] text-right text-[12px] text-warm" role="status">
          {aviso}
        </span>
      )}
    </div>
  );
}
