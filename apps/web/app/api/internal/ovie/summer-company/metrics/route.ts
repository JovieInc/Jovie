import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseDailyMetrics } from '@/lib/ovie/company-history/daily-metrics';
import { readCompanyMetrics } from '@/lib/ovie/company-history/daily-metrics.server';
import { parseHistoryWindows } from '@/lib/ovie/company-history/windows';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';

const ROUTE = '/api/internal/ovie/summer-company/metrics';

/**
 * Daily company metrics for Summer and agents (`?metric=signups,ai_spend`,
 * `?days=7,30`): signups, paid signups, onboarding chats, AI spend, failed CI
 * runs and Linear issues per Pacific day, as window summaries. Cache-only:
 * zero provider calls and zero model calls on this path.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  try {
    const params = new URL(request.url).searchParams;
    const readback = await readCompanyMetrics(
      parseDailyMetrics(params.get('metric')),
      parseHistoryWindows(params.get('days'))
    );
    if (!readback) {
      return NextResponse.json(
        { error: 'company_metrics_unavailable' },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(readback, { headers: NO_STORE_HEADERS });
  } catch (error) {
    await captureError('Summer company metrics read failed', error, {
      route: ROUTE,
    });
    return NextResponse.json(
      { error: 'company_metrics_unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
