import {
  EstadoExhibicion,
  EstadoFinanciero,
  EstadoPlan,
} from "@prisma/client";

export function PageHead({
  eyebrow,
  titulo,
  descripcion,
  accion,
}: {
  eyebrow: string;
  titulo: string;
  descripcion?: string;
  accion?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="panel-etiqueta">{eyebrow}</p>
        <h1 className="panel-titulo mt-3">{titulo}</h1>
        {descripcion && <p className="mt-4 max-w-[60ch] text-[16.5px] text-ink-2">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}

export function Money({ valor, conCentavos = false }: { valor: number; conCentavos?: boolean }) {
  return (
    <>
      $
      {valor.toLocaleString("es-MX", {
        minimumFractionDigits: conCentavos ? 2 : 0,
        maximumFractionDigits: conCentavos ? 2 : 0,
      })}
    </>
  );
}

export function Stat({ etiqueta, valor, nota }: { etiqueta: string; valor: React.ReactNode; nota?: string }) {
  return (
    <div>
      <p className="label">{etiqueta}</p>
      <p className="figure mt-1 text-[26px]">{valor}</p>
      {nota && <p className="mt-1 text-[13px] text-muted">{nota}</p>}
    </div>
  );
}

const ETIQUETA_FINANCIERO: Record<EstadoFinanciero, { texto: string; clase: string }> = {
  COTIZADO: { texto: "Cotizado", clase: "wait" },
  APARTADO: { texto: "Apartado", clase: "info" },
  AL_CORRIENTE: { texto: "Al corriente", clase: "ok" },
  LIQUIDADO: { texto: "Liquidado", clase: "ok" },
  SUSPENDIDO: { texto: "Suspendido", clase: "late" },
  CANCELADO: { texto: "Cancelado", clase: "late" },
};

export function ChipEstadoFinanciero({ estado }: { estado: EstadoFinanciero }) {
  const { texto, clase } = ETIQUETA_FINANCIERO[estado];
  return <span className={`chip ${clase}`}>{texto}</span>;
}

const ETIQUETA_PLAN: Record<EstadoPlan, { texto: string; clase: string }> = {
  COTIZADO: { texto: "Cotización", clase: "wait" },
  ACTIVO: { texto: "Activo", clase: "ok" },
  SUSPENDIDO: { texto: "Suspendido", clase: "late" },
  LIQUIDADO: { texto: "Liquidado", clase: "ok" },
  CANCELADO: { texto: "Cancelado", clase: "late" },
};

export function ChipEstadoPlan({ estado }: { estado: EstadoPlan }) {
  const { texto, clase } = ETIQUETA_PLAN[estado];
  return <span className={`chip ${clase}`}>{texto}</span>;
}

/**
 * La cinta: una marca por exhibición. Se ve de un golpe cuál falló,
 * no solo qué porcentaje se lleva pagado.
 */
export function CintaExhibiciones({
  exhibiciones,
}: {
  exhibiciones: { numero: number; estado: EstadoExhibicion }[];
}) {
  return (
    <div className="ribbon" aria-label="Avance del plan, exhibición por exhibición">
      {exhibiciones.map((e) => {
        const clase =
          e.estado === EstadoExhibicion.PAGADA
            ? "pagada"
            : e.estado === EstadoExhibicion.VENCIDA
              ? "vencida"
              : "";
        return (
          <div
            key={e.numero}
            className={`m ${clase} ${e.numero === 0 ? "anticipo" : ""}`}
            title={`${e.numero === 0 ? "Anticipo" : `Mensualidad ${e.numero}`} · ${e.estado.toLowerCase()}`}
          >
            {e.numero === 0 ? "Anticipo" : e.numero}
          </div>
        );
      })}
    </div>
  );
}
