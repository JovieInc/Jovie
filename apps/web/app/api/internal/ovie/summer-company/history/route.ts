import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { readCompanyHistory } from '@/lib/ovie/company-history/store.server';
import { parseHistoryWindows } from '@/lib/ovie/company-history/windows';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/internal/ovie/summer-company/history';

/**
 * Daily company history for Summer and agents: merged PRs per Pacific day,
 * org-wide and per repository, as window summaries (`?days=7,30`). Cache-only:
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
    const windows = parseHistoryWindows(
      new URL(request.url).searchParams.get('days')
    );
    const history = await readCompanyHistory(windows);
    if (!history) {
      return NextResponse.json(
        { error: 'company_history_unavailable' },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(history, { headers: NO_STORE_HEADERS });
  } catch (error) {
    await captureError('Summer company history read failed', error, {
      route: ROUTE,
    });
    return NextResponse.json(
      { error: 'company_history_unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
