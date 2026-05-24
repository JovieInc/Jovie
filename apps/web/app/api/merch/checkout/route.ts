import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAppFlagValue } from '@/lib/flags/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import { createMerchCheckoutSession } from '@/lib/merch/orders';
import {
  createRateLimitHeaders,
  getClientIP,
  merchCheckoutLimiter,
} from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const checkoutSchema = z.object({
  merchCardId: z.string().uuid(),
  variantKey: z.string().min(1).max(80),
  quantity: z.number().int().min(1).max(5).default(1),
  handle: z.string().min(1).max(64),
});

export async function POST(request: Request) {
  const ip = getClientIP(request);
  const rateLimit = await merchCheckoutLimiter.limit(ip);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Too many checkout requests. Please try again later.' },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          ...createRateLimitHeaders(rateLimit),
        },
      }
    );
  }

  const parsedBody = await parseJsonBody<unknown>(request, {
    route: '/api/merch/checkout',
    headers: NO_STORE_HEADERS,
  });
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = checkoutSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid checkout request' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const merchEnabled = await getAppFlagValue('MERCH_MVP', { userId: null });
    if (!merchEnabled) {
      return NextResponse.json(
        { error: 'Merch checkout is not available.' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const session = await createMerchCheckoutSession(parsed.data);
    return NextResponse.json(session, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error('[merch] Checkout session creation failed', { error });
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
