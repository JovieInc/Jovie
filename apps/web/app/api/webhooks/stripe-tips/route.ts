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

export async function POST(req: NextRequest) {
  try {
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET_TIPS;
    if (!webhookSecret) {
      logger.error('STRIPE_WEBHOOK_SECRET_TIPS not configured');
      return NextResponse.json(
        { error: 'Webhook not configured' },
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
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      logger.error('Invalid Stripe signature for tip webhook', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;
      }
      case 'charge.refunded': {
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      }
      default: {
        logger.info(`Unhandled tip webhook event type: ${event.type}`);
      }
    }

    return NextResponse.json({ received: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error('Tip webhook error:', error);
    await captureCriticalError('Tip webhook error', error, {
      route: '/api/webhooks/stripe-tips',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const handle = session.metadata?.handle;
  const profileId = session.metadata?.profile_id;
  const platformFeeCents = session.metadata?.platform_fee_cents
    ? Number.parseInt(session.metadata.platform_fee_cents, 10)
    : null;

  if (!handle && !profileId) {
    logger.warn(
      'Tip checkout completed without handle or profile_id metadata',
      {
        session_id: session.id,
      }
    );
    return;
  }

  // Resolve creator profile
  let creatorProfileId = profileId;

  if (!creatorProfileId && handle) {
    const [profile] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, handle.toLowerCase()))
      .limit(1);

    creatorProfileId = profile?.id ?? null;
  }

  if (!creatorProfileId) {
    await captureCriticalError(
      'Tip checkout completed but no creator profile found',
      new Error('Creator profile not found for tip checkout'),
      {
        route: '/api/webhooks/stripe-tips',
        handle,
        session_id: session.id,
        amount: session.amount_total,
      }
    );
    return;
  }

  // Get payment intent ID from the session
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? `cs_${session.id}`);

  const tipperEmail =
    session.customer_details?.email ?? session.customer_email ?? null;
  const tipperName = session.customer_details?.name ?? null;

  const [inserted] = await db
    .insert(tips)
    .values({
      creatorProfileId,
      amountCents: session.amount_total ?? 0,
      currency: 'USD',
      paymentIntentId,
      stripeCheckoutSessionId: session.id,
      contactEmail: tipperEmail,
      tipperName,
      status: 'completed',
      platformFeeCents: platformFeeCents ?? null,
      metadata: {
        source: 'checkout',
        ...(session.metadata ?? {}),
      },
    })
    .onConflictDoNothing({ target: tips.paymentIntentId })
    .returning({ id: tips.id });

  if (!inserted) {
    logger.info('Duplicate tip checkout event, record already exists', {
      session_id: session.id,
      payment_intent: paymentIntentId,
    });
    return;
  }

  logger.info('Tip received via checkout:', {
    tip_id: inserted.id,
    artist_handle: handle,
    amount_cents: session.amount_total,
    session_id: session.id,
    tipper_email: tipperEmail,
  });
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id;

  if (!paymentIntentId) {
    logger.warn('Charge refunded but no payment_intent ID', {
      charge_id: charge.id,
    });
    return;
  }

  const [updated] = await db
    .update(tips)
    .set({
      status: 'refunded',
      updatedAt: new Date(),
    })
    .where(eq(tips.paymentIntentId, paymentIntentId))
    .returning({ id: tips.id });

  if (updated) {
    logger.info('Tip refunded:', {
      tip_id: updated.id,
      payment_intent: paymentIntentId,
      charge_id: charge.id,
    });
  } else {
    logger.info('Charge refunded but no matching tip found', {
      payment_intent: paymentIntentId,
      charge_id: charge.id,
    });
  }
}
