import { PageHead } from "@/components/ui";

export default function PruebaPagosPage() {
  const tieneLlavePublica =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") ?? false;
  const tieneLlaveSecreta = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ?? false;

  return (
    <div className="flex flex-col gap-8">
      <PageHead
        eyebrow="Stripe · ambiente de pruebas"
        titulo="Prueba desde un plan"
        descripcion="Los intents se preparan con una exhibición real del plan y la cuenta conectada asignada a su proyecto."
        accion={<span className="chip info">Sólo modo prueba</span>}
      />

      {!tieneLlavePublica || !tieneLlaveSecreta ? (
        <p className="note blocked" role="status">
          Configuración pendiente: añade una llave publicable <code>pk_test_</code> y una llave
          secreta <code>sk_test_</code>. No se inicializa Stripe ni se habilitan operaciones sin ambas.
        </p>
      ) : (
        <p className="note" role="status">
          Llaves de prueba detectadas. No se crean cobros independientes ni importes de demostración;
          prepara el anticipo desde el detalle de un plan con contrato firmado.
        </p>
      )}

      <p className="note blocked" role="status">
        Bloqueo actual: el servidor no implementa SetupIntent ni persiste el consentimiento de los
        cargos futuros. La confirmación de un PaymentIntent no se presentará como pago aplicado;
        esa confirmación depende del webhook.
      </p>
    </div>
  );
}
