import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  readCompanyStateCache,
  readCompanyStateHistory,
} from '@/lib/ovie/company-state.server';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cache-only company truth for ordinary Summer questions. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  try {
    const readback = await readCompanyStateCache();
    if (!readback) {
      return NextResponse.json(
        { error: 'company_state_unavailable' },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }
    const requested = Number(
      new URL(request.url).searchParams.get('history') ?? 0
    );
    const history =
      Number.isSafeInteger(requested) && requested > 0
        ? await readCompanyStateHistory(requested)
        : [];
    return NextResponse.json(
      { ...readback, history },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    await captureError('Summer company state read failed', error, {
      route: '/api/internal/ovie/summer-company/state',
    });
    return NextResponse.json(
      { error: 'company_state_unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
