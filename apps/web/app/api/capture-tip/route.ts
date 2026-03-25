import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { db } from '@/lib/db';
import { tips } from '@/lib/db/schema/analytics';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { env } from '@/lib/env-server';
import { captureCriticalError } from '@/lib/error-tracking';
import { stripe } from '@/lib/stripe/client';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

async function resolveCreatorProfileId(
  pi: Stripe.PaymentIntent
): Promise<string | null> {
  const metadataProfileId =
    typeof pi.metadata?.profile_id === 'string' ? pi.metadata.profile_id : null;
  const handle =
    typeof pi.metadata?.handle === 'string' ? pi.metadata.handle : null;

  if (metadataProfileId) {
    const [profile] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, metadataProfileId))
      .limit(1);
    if (profile) return profile.id;
  }

  if (handle) {
    const [profile] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, handle.toLowerCase()))
      .limit(1);
    if (profile) return profile.id;
  }

  return null;
}

async function handlePaymentIntentSucceeded(
  event: Stripe.Event
): Promise<NextResponse | null> {
  const pi = event.data.object as Stripe.PaymentIntent;
  const charge = (
    pi as Stripe.PaymentIntent & { charges?: { data: Stripe.Charge[] } }
  ).charges?.data?.[0];

  const handle =
    typeof pi.metadata?.handle === 'string' ? pi.metadata.handle : null;
  const creatorProfileId = await resolveCreatorProfileId(pi);

  if (!creatorProfileId) {
    void captureCriticalError(
      'Tip payment succeeded but no creator profile found',
      new Error('Creator profile not found for tip'),
      {
        route: '/api/capture-tip',
        handle,
        metadata_profile_id: pi.metadata?.profile_id ?? null,
        payment_intent: pi.id,
        amount_cents: pi.amount_received,
      }
    ).catch(() => {});
    return NextResponse.json(
      {
        received: true,
        warning: 'Creator profile not found',
        payment_intent: pi.id,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  const [inserted] = await db
    .insert(tips)
    .values({
      creatorProfileId,
      amountCents: pi.amount_received,
      currency: 'USD',
      paymentIntentId: pi.id,
      contactEmail: charge?.billing_details?.email ?? null,
      contactPhone: charge?.billing_details?.phone ?? null,
      metadata: (pi.metadata ?? {}) as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: tips.paymentIntentId })
    .returning({ id: tips.id });

  if (!inserted) {
    logger.info('Duplicate tip event, record already exists', {
      payment_intent: pi.id,
    });
  }

  logger.info('Tip received:', {
    artist_id: handle,
    amount_cents: pi.amount_received,
    currency: pi.currency?.toUpperCase(),
    payment_intent: pi.id,
    contact_email: charge?.billing_details?.email,
    contact_phone: charge?.billing_details?.phone,
  });

  return null;
}

export async function POST(req: NextRequest) {
  try {
    if (!env.STRIPE_TIP_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: 'Stripe webhook not configured' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'No signature' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        env.STRIPE_TIP_WEBHOOK_SECRET
      );
    } catch (err) {
      logger.error('Invalid signature', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (event.type === 'payment_intent.succeeded') {
      const result = await handlePaymentIntentSucceeded(event);
      if (result) return result;
    }

    return NextResponse.json({ received: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error('Tip webhook error:', error);
    await captureCriticalError('Tip webhook error', error, {
      route: '/api/capture-tip',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
