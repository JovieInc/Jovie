import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { PRODUCT_FRESHNESS_MS } from '@/lib/ovie/company-state';
import { readCompanyStateCache } from '@/lib/ovie/company-state.server';
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
    const cached = await readCompanyStateCache();
    const report = cached?.snapshot?.sourcePayloads?.signupFunnel;
    const observedAt =
      typeof report?.observedAt === 'string'
        ? Date.parse(report.observedAt)
        : Number.NaN;
    const ageMs = Date.now() - observedAt;
    // The retained company snapshot has no TTL. Apply its existing product
    // freshness policy to the raw observation, not the snapshot's refresh time.
    if (
      !report ||
      !Number.isFinite(ageMs) ||
      ageMs < 0 ||
      ageMs > PRODUCT_FRESHNESS_MS
    ) {
      return NextResponse.json(
        { error: 'funnel_unavailable' },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(report, {
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
