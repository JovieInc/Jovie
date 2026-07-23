import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import {
  getNavigationTelemetryBaseline,
  NavigationTelemetryStoreUnavailableError,
  recordNavigationTelemetryBatch,
} from '@/lib/analytics/navigation-telemetry.server';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  createRateLimitHeaders,
  navigationTelemetryLimiter,
} from '@/lib/rate-limit';
import {
  navigationTelemetryBatchSchema,
  navigationTelemetryPayloadSchema,
} from '@/lib/tracking/navigation-telemetry-contract';

const ROUTE = '/api/analytics/navigation';
const MAX_BODY_BYTES = 8192;

function unavailableResponse() {
  return NextResponse.json(
    { error: 'Navigation telemetry unavailable' },
    { status: 503 }
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = await navigationTelemetryLimiter.limit(userId);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: createRateLimitHeaders(rateLimit) }
    );
  }

  const body = await parseJsonBody(request, {
    route: ROUTE,
    maxBodySize: MAX_BODY_BYTES,
  });
  if (!body.ok) return body.response;

  const batch = navigationTelemetryBatchSchema.safeParse(body.data);
  let events;
  if (batch.success) {
    events = batch.data.events;
  } else {
    const legacyEvent = navigationTelemetryPayloadSchema.safeParse(body.data);
    if (!legacyEvent.success) {
      return NextResponse.json(
        { error: 'Invalid telemetry event' },
        { status: 400 }
      );
    }
    events = [legacyEvent.data];
  }

  try {
    // Authentication is an abuse boundary and a contribution cap only. The
    // sink stores a rotating daily hash, never the account identity.
    await recordNavigationTelemetryBatch(events, { contributorId: userId });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof NavigationTelemetryStoreUnavailableError) {
      return unavailableResponse();
    }
    await captureError('Navigation telemetry aggregate write failed', error, {
      route: ROUTE,
      method: 'POST',
    });
    return unavailableResponse();
  }
}

export async function GET(): Promise<NextResponse> {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const baseline = await getNavigationTelemetryBaseline();
    return NextResponse.json(baseline, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (!(error instanceof NavigationTelemetryStoreUnavailableError)) {
      await captureError('Navigation telemetry baseline read failed', error, {
        route: ROUTE,
        method: 'GET',
      });
    }
    return unavailableResponse();
  }
}
