import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  confirmarCobroStripe,
  marcarIntentoCobroFallido,
} from "@/lib/motor/planes";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  if (!stripeSecretKey || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook no configurado." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Falta la firma de Stripe." }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;

  try {
    const stripe = new Stripe(stripeSecretKey);
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Firma de Stripe inválida." }, { status: 400 });
  }

  const stripeAccountId = event.account ?? request.headers.get("stripe-account");
  if (!stripeAccountId) {
    return NextResponse.json({ error: "El evento no identifica una cuenta Stripe." }, { status: 400 });
  }

  const existingEvent = await prisma.eventoStripe.findUnique({
    where: { stripeEventId: event.id },
  });
  if (existingEvent?.procesado) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (!existingEvent) {
    await prisma.eventoStripe.create({
      data: {
        stripeEventId: event.id,
        stripeAccountId,
        tipo: event.type,
        payload: JSON.parse(rawBody),
      },
    });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const latestCharge =
        typeof paymentIntent.latest_charge === "string" ? paymentIntent.latest_charge : undefined;
      await confirmarCobroStripe({
        paymentIntentId: paymentIntent.id,
        stripeAccountId,
        stripeChargeId: latestCharge,
      });
    }

    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      await marcarIntentoCobroFallido({
        paymentIntentId: paymentIntent.id,
        stripeAccountId,
        codigo: paymentIntent.last_payment_error?.code,
        mensaje: paymentIntent.last_payment_error?.message,
      });
    }

    await prisma.eventoStripe.update({
      where: { stripeEventId: event.id },
      data: { procesado: true, procesadoEn: new Date() },
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error al procesar webhook de Stripe:", error);
    await prisma.eventoStripe.update({
      where: { stripeEventId: event.id },
      data: { error: "No se pudo procesar el evento." },
    });
    return NextResponse.json({ error: "No se pudo procesar el evento." }, { status: 500 });
  }
}
