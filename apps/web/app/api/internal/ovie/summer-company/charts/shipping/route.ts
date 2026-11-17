import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { renderShippingChart } from '@/lib/ovie/company-history/render.server';
import { readCompanyHistory } from '@/lib/ovie/company-history/store.server';
import { parseHistoryWindows } from '@/lib/ovie/company-history/windows';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';

const ROUTE = '/api/internal/ovie/summer-company/charts/shipping';

const headerNumber = (value: number | null) =>
  value === null ? 'unknown' : String(value);

/**
 * Shipping chart PNG for one window (`?days=7` or `30`), drawn from the
 * company history cache. The numbers the picture shows ride along as headers,
 * so the text that goes with the image comes from the same read and the two
 * can never disagree. Zero provider calls and zero model calls.
 */
export async function GET(request: Request): Promise<Response> {
  if (!(await verifySummerOidcRequest(request))) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  try {
    const [days] = parseHistoryWindows(
      new URL(request.url).searchParams.get('days'),
      [7]
    );
    const history = await readCompanyHistory([days!]);
    const windows = history?.windows[String(days)];
    if (!history || !windows) {
      return NextResponse.json(
        { error: 'company_history_unavailable' },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }
    const org = windows.org;
    const today = org.points[org.points.length - 1];
    const image = await renderShippingChart({
      windows,
      observedAt: history.observedAt,
    });
    const png = await image.arrayBuffer();
    return new Response(png, {
      headers: {
        ...NO_STORE_HEADERS,
        'content-type': 'image/png',
        'x-company-history-days': String(days),
        'x-company-history-from': org.from,
        'x-company-history-to': org.to,
        'x-company-history-total': headerNumber(org.total),
        'x-company-history-prior-total': headerNumber(org.priorTotal),
        'x-company-history-change-percent': headerNumber(org.changePercent),
        'x-company-history-today': headerNumber(today?.count ?? null),
        'x-company-history-complete': String(org.complete),
        'x-company-history-observed-at': history.observedAt ?? 'unknown',
      },
    });
  } catch (error) {
    await captureError('Summer shipping chart failed', error, {
      route: ROUTE,
    });
    return NextResponse.json(
      { error: 'company_chart_unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
