import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { parseJsonBody } from '@/lib/http/parse-json';
import { createRateLimitHeaders, paymentIntentLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import {
  type TipIntentPayload,
  tipIntentSchema,
} from '@/lib/validation/schemas';
import { validateUsername } from '@/lib/validation/username';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

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

    if (!process.env.STRIPE_SECRET_KEY) {
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
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: { handle, amount },
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
