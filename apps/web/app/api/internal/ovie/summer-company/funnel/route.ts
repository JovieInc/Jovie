import { NextResponse } from 'next/server';
import { getSummerFunnel } from '@/lib/analytics/signup-funnel.server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Signup funnel aggregates for Summer: step counts and step conversion for
 * the fan subscribe and artist signup funnels over 24h and 7d. Aggregates
 * only; no rows, ids, or contact data.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  try {
    return NextResponse.json(await getSummerFunnel(), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    await captureError('Summer funnel read failed', error, {
      route: '/api/internal/ovie/summer-company/funnel',
    });
    return NextResponse.json(
      { error: 'funnel_unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
