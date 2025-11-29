import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/db';
import { creatorProfiles, tips } from '@/lib/db/schema';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    if (
      !process.env.STRIPE_SECRET_KEY ||
      !process.env.STRIPE_TIP_WEBHOOK_SECRET
    ) {
      return NextResponse.json(
        { error: 'Stripe not configured' },
        { status: 500 }
      );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const body = await req.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_TIP_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Invalid signature', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const charge = (
        pi as Stripe.PaymentIntent & { charges?: { data: Stripe.Charge[] } }
      ).charges?.data?.[0];

      const handle =
        typeof pi.metadata?.handle === 'string' ? pi.metadata.handle : null;

      let creatorProfileId: string | null = null;

      if (handle) {
        const [profile] = await db
          .select({ id: creatorProfiles.id })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.usernameNormalized, handle.toLowerCase()))
          .limit(1);

        creatorProfileId = profile?.id ?? null;
      }

      if (!creatorProfileId) {
        console.warn('Tip received for unknown or missing handle', {
          handle,
          payment_intent: pi.id,
        });
      } else {
        const [inserted] = await db
          .insert(tips)
          .values({
            creatorProfileId,
            amountCents: pi.amount_received,
            // All tips are currently created in USD in create-tip-intent.
            currency: 'USD',
            paymentIntentId: pi.id,
            contactEmail: charge?.billing_details?.email ?? null,
            contactPhone: charge?.billing_details?.phone ?? null,
            metadata: (pi.metadata ?? {}) as Record<string, unknown>,
          })
          .onConflictDoNothing({ target: tips.paymentIntentId })
          .returning({ id: tips.id });

        if (!inserted) {
          console.log('Duplicate tip event, record already exists', {
            payment_intent: pi.id,
          });
        }
      }

      console.log('Tip received:', {
        artist_id: handle,
        amount_cents: pi.amount_received,
        currency: pi.currency?.toUpperCase(),
        payment_intent: pi.id,
        contact_email: charge?.billing_details?.email,
        contact_phone: charge?.billing_details?.phone,
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Tip webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
