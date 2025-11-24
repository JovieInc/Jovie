import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { creatorProfiles, db, tips } from '@/lib/db';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_TIP_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: 'Stripe not configured' },
        { status: 500 }
      );
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
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
        env.STRIPE_TIP_WEBHOOK_SECRET
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

      const handle = pi.metadata?.handle;

      // Best-effort mapping from handle to creator profile; log and return if not found
      if (!handle) {
        console.warn('Tip received without handle metadata', {
          payment_intent: pi.id,
        });
      } else {
        try {
          const [profile] = await db
            .select({ id: creatorProfiles.id })
            .from(creatorProfiles)
            .where(eq(creatorProfiles.usernameNormalized, handle.toLowerCase()))
            .limit(1);

          if (!profile?.id) {
            console.warn('Tip received for unknown handle', {
              handle,
              payment_intent: pi.id,
            });
          } else {
            await db.insert(tips).values({
              creatorProfileId: profile.id,
              amountCents: pi.amount_received ?? 0,
              currency: (pi.currency || 'usd').toUpperCase() as
                | 'USD'
                | 'EUR'
                | 'GBP'
                | 'CAD'
                | 'AUD',
              paymentIntentId: pi.id,
              contactEmail: charge?.billing_details?.email ?? null,
              contactPhone: charge?.billing_details?.phone ?? null,
              message:
                typeof pi.metadata?.message === 'string'
                  ? pi.metadata.message
                  : null,
              isAnonymous:
                pi.metadata?.is_anonymous === 'true' ||
                pi.metadata?.is_anonymous === '1',
              metadata: {
                source: 'stripe_tip_webhook',
                raw_metadata: pi.metadata || {},
              },
            });

            console.log('Tip stored:', {
              creator_profile_id: profile.id,
              handle,
              amount_cents: pi.amount_received,
              currency: pi.currency?.toUpperCase(),
              payment_intent: pi.id,
            });
          }
        } catch (dbError) {
          console.error('Failed to persist tip record', dbError);
        }
      }
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
