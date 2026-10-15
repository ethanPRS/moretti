/**
 * Piezas compartidas de Cobranza, Fiscal y Pagos a Moretti (D-47): la franja
 * de estado, las iniciales y los íconos. Los estilos viven en panel.css (bo-*).
 */

const ICONOS = {
  ok: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  aviso: <path d="M12 8v5m0 3.5v.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z" />,
};

/** Una franja: verde si todo va bien, terracota si hay algo que atender. */
export function Estado({ tipo, titulo, children }: { tipo: "ok" | "aviso"; titulo: string; children?: React.ReactNode }) {
  return (
    <div className={`bo-estado ${tipo === "aviso" ? "atencion" : ""}`} role="status">
      <span className="bo-estado-ico">
        <svg viewBox="0 0 24 24" aria-hidden="true">{ICONOS[tipo]}</svg>
      </span>
      <div>
        <b>{titulo}</b>
        {children && <span>{children}</span>}
      </div>
    </div>
  );
}

/** «Ana Cristina López» → «AL». */
export function Iniciales({ nombre }: { nombre: string }) {
  const partes = nombre.trim().split(/\s+/);
  const ini = ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
  return (
    <span className="bo-ini" aria-hidden="true">
      {ini || "·"}
    </span>
  );
}

export function IconoAviso() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {ICONOS.aviso}
    </svg>
  );
}
