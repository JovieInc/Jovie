import { NextResponse } from 'next/server';
import {
  HelpCenterStoreUnavailableError,
  recordHelpCenterEvents,
} from '@/lib/analytics/help-center.server';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  apiLimiter,
  createRateLimitHeaders,
  getClientIP,
} from '@/lib/rate-limit';
import {
  HELP_CENTER_ALLOWED_ORIGINS,
  helpCenterBatchSchema,
  helpCenterEventSchema,
} from '@/lib/tracking/help-center-contract';

const ROUTE = '/api/analytics/help-center';
const MAX_BODY_BYTES = 8192;

function corsOrigin(request: Request): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  if (
    (HELP_CENTER_ALLOWED_ORIGINS as readonly string[]).includes(origin) ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ) {
    return origin;
  }
  return null;
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = corsOrigin(request);
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function OPTIONS(request: Request): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

function unavailableResponse(request: Request) {
  return NextResponse.json(
    { error: 'Help Center analytics unavailable' },
    { status: 503, headers: corsHeaders(request) }
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = await apiLimiter.limit(getClientIP(request));
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: {
          ...createRateLimitHeaders(rateLimit),
          ...corsHeaders(request),
        },
      }
    );
  }

  const body = await parseJsonBody(request, {
    route: ROUTE,
    maxBodySize: MAX_BODY_BYTES,
  });
  if (!body.ok) return body.response;

  const batch = helpCenterBatchSchema.safeParse(body.data);
  let events;
  if (batch.success) {
    events = batch.data.events;
  } else {
    const single = helpCenterEventSchema.safeParse(body.data);
    if (!single.success) {
      return NextResponse.json(
        { error: 'Invalid help center event' },
        { status: 400, headers: corsHeaders(request) }
      );
    }
    events = [single.data];
  }

  try {
    const result = await recordHelpCenterEvents(events);
    return NextResponse.json(result, {
      status: 202,
      headers: corsHeaders(request),
    });
  } catch (error) {
    if (!(error instanceof HelpCenterStoreUnavailableError)) {
      await captureError('Help Center analytics write failed', error, {
        route: ROUTE,
        method: 'POST',
      });
    }
    return unavailableResponse(request);
  }
}
