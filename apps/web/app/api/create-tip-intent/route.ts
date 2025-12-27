import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/http/parse-json';
import { validateUsername } from '@/lib/validation/username';
import { NO_STORE_HEADERS } from '@/lib/api/constants';

export const runtime = 'nodejs';


const TipIntentSchema = z.object({
  amount: z.number().int().min(1).max(500),
  handle: z.string(),
});

type TipIntentInput = z.infer<typeof TipIntentSchema>;

export async function POST(req: NextRequest) {
  try {
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

    const parsed = TipIntentSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid tip request' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { amount, handle }: TipIntentInput = parsed.data;

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
    console.error('Create tip intent error:', error);
    return NextResponse.json(
      { error: 'Failed to create tip' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
