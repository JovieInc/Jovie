import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOptionalAuth } from '@/lib/auth/cached';
import { doesTableExist } from '@/lib/db';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import { recordProductFunnelClientEvent } from '@/lib/product-funnel/events';
import { isProductFunnelClientEventType } from '@/lib/product-funnel/shared';
import { createRateLimitHeaders, publicVisitLimiter } from '@/lib/rate-limit';
import { extractClientIP } from '@/lib/utils/ip-extraction';

export const runtime = 'nodejs';

const trackFunnelEventSchema = z.object({
  eventType: z.string().refine(isProductFunnelClientEventType, {
    message: 'Unsupported funnel event type',
  }),
  sessionId: z.string().min(8).max(128),
  sourceSurface: z.string().max(128).optional().nullable(),
  sourceRoute: z.string().max(256).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const rateLimitResult = await publicVisitLimiter.limit(
    extractClientIP(request.headers)
  );
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          ...createRateLimitHeaders(rateLimitResult),
        },
      }
    );
  }

  const parsed = await parseJsonBody(request, {
    route: 'POST /api/funnel/track',
    headers: NO_STORE_HEADERS,
  });

  if (!parsed.ok) {
    return parsed.response;
  }

  const validated = trackFunnelEventSchema.safeParse(parsed.data);
  if (!validated.success) {
    return NextResponse.json(
      {
        error: 'Invalid funnel payload',
        issues: validated.error.flatten(),
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    if (!(await doesTableExist('product_funnel_events'))) {
      return NextResponse.json(
        {
          success: false,
          inserted: false,
          reason: 'product_funnel_schema_unavailable',
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    const auth = await getOptionalAuth();
    const inserted = await recordProductFunnelClientEvent({
      ...validated.data,
      userClerkId: auth.userId ?? undefined,
    });

    return NextResponse.json(
      { success: true, inserted },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Failed to track product funnel event', error, {
      route: '/api/funnel/track',
    });
    return NextResponse.json(
      { error: 'Unable to track funnel event' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}
