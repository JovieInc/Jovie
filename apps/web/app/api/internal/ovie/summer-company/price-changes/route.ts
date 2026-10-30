import { NextResponse } from 'next/server';
import { getPriceChangeNoticeMetrics } from '@/lib/billing/price-changes/metrics.server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';

/**
 * Read-only price-change notice metrics for Ovie's billing/revenue area:
 * notices scheduled, sent, failed and the time from scheduling to fully notified.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  try {
    return NextResponse.json(await getPriceChangeNoticeMetrics(), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    await captureError('Price change notice metrics read failed', error, {
      route: '/api/internal/ovie/summer-company/price-changes',
    });
    return NextResponse.json(
      { error: 'price_change_metrics_unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
