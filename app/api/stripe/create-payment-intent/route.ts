import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { prepararIntentoCobro, ReglaError } from "@/lib/motor/planes";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

export async function POST(request: NextRequest) {
  if (!stripeSecretKey?.startsWith("sk_test_")) {
    return NextResponse.json(
      { error: "Falta una llave secreta de prueba de Stripe." },
      { status: 500 }
    );
  }

  try {
    const body = (await request.json()) as { exhibicionId?: string };
    if (!body.exhibicionId) {
      return NextResponse.json({ error: "Falta la exhibición que se desea cobrar." }, { status: 400 });
    }

    const intento = await prepararIntentoCobro(body.exhibicionId);
    const stripe = new Stripe(stripeSecretKey);

    if (intento.stripePaymentIntentId) {
      const existingIntent = await stripe.paymentIntents.retrieve(
        intento.stripePaymentIntentId,
        {},
        { stripeAccount: intento.stripeAccountId }
      );
      return NextResponse.json({
        clientSecret: existingIntent.client_secret,
        stripeAccountId: intento.stripeAccountId,
        intentoId: intento.id,
      });
    }

    const amount = Number(new Prisma.Decimal(intento.monto).mul(100).toFixed(0));
    const applicationFeeAmount = Number(
      new Prisma.Decimal(intento.montoComision).mul(100).toFixed(0)
    );
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount,
        currency: "mxn",
        payment_method_types: ["card"],
        application_fee_amount: applicationFeeAmount,
        description: `Cobro Moretti · exhibición ${intento.exhibicionId}`,
        metadata: {
          intentoCobroId: intento.id,
          planId: intento.planId,
          exhibicionId: intento.exhibicionId,
        },
      },
      {
        stripeAccount: intento.stripeAccountId,
        idempotencyKey: intento.idempotencyKey,
      }
    );

    await prisma.intentoCobro.update({
      where: { id: intento.id },
      data: { stripePaymentIntentId: paymentIntent.id },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      stripeAccountId: intento.stripeAccountId,
      intentoId: intento.id,
    });
  } catch (error) {
    if (error instanceof ReglaError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Error al preparar el PaymentIntent de prueba:", error);
    return NextResponse.json(
      { error: "No se pudo preparar el pago de prueba." },
      { status: 500 }
    );
  }
}
