import { auth } from '@clerk/nextjs/server';
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { env } from '@/lib/env-server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import { createRateLimitHeaders, paymentIntentLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import {
  type TipIntentPayload,
  tipIntentSchema,
} from '@/lib/validation/schemas';
import { validateUsername } from '@/lib/validation/username';

export const runtime = 'nodejs';

/**
 * Hash a handle for metadata storage to prevent PII exposure.
 * Uses HMAC-SHA256 keyed by METADATA_HASH_KEY for secure, non-reversible hashing.
 */
function hashHandleForMetadata(handle: string): string {
  const key = env.METADATA_HASH_KEY;
  if (!key) {
    // Fall back to unkeyed hash if key not configured (development only)
    return crypto
      .createHash('sha256')
      .update(`jovie:tip:${handle.toLowerCase()}`)
      .digest('hex')
      .substring(0, 16);
  }
  return crypto
    .createHmac('sha256', key)
    .update(handle.toLowerCase())
    .digest('hex')
    .substring(0, 16);
}

/**
 * Convert amount to cents with overflow protection.
 * Converts dollars (potentially fractional) to cents, then clamps.
 * Maximum: 50000 cents ($500), Minimum: 100 cents ($1)
 */
function amountToCents(amount: number): number {
  // Convert to cents first, then clamp
  const cents = Math.round(amount * 100);
  return Math.max(100, Math.min(50000, cents));
}

export async function POST(req: NextRequest) {
  try {
    // Require authentication for payment intents
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Rate limiting: 10 payment intents per hour per user
    const rateLimitResult = await paymentIntentLimiter.limit(userId);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many payment intent requests. Please try again later.' },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            ...createRateLimitHeaders(rateLimitResult),
          },
        }
      );
    }

    if (!env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Stripe not configured' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    const parsedBody = await parseJsonBody<unknown>(req, {
      route: 'POST /api/create-tip-intent',
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const json = parsedBody.data;

    const parsed = tipIntentSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid tip request' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { amount, handle }: TipIntentPayload = parsed.data;

    const usernameValidation = validateUsername(handle);
    if (!usernameValidation.isValid) {
      return NextResponse.json(
        { error: usernameValidation.error ?? 'Invalid handle' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);

    // Convert to cents with overflow protection
    const amountInCents = amountToCents(amount);

    // Hash handle to prevent PII exposure in third-party metadata
    // The original handle can be correlated via internal logs if needed
    const handleHash = hashHandleForMetadata(handle);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      // Store hashed handle instead of plaintext to prevent PII exposure
      // Stripe metadata values must be strings
      metadata: {
        handle_hash: handleHash,
        amount_cents: String(amountInCents),
      },
    });

    return NextResponse.json(
      { clientSecret: paymentIntent.client_secret },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Create tip intent error:', error);
    return NextResponse.json(
      { error: 'Failed to create tip' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
