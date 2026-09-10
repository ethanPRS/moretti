"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MarcarPagadaButton({
  planId,
  exhibicionId,
}: {
  planId: string;
  exhibicionId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function marcar() {
    setLoading(true);
    const res = await fetch(`/api/planes/${planId}/exhibiciones/${exhibicionId}`, {
      method: "PATCH",
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Error al marcar la exhibición.");
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={marcar}
      disabled={loading}
      className="text-xs font-medium text-zinc-900 underline disabled:opacity-50"
    >
      {loading ? "..." : "Marcar como pagada"}
    </button>
  );
}
