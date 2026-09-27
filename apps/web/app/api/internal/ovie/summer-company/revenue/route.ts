import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { getSummerRevenue } from '@/lib/ovie/summer-company.server';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Read-only company revenue for Summer: Jovie Stripe MRR and LYB daily MRR. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  try {
    return NextResponse.json(await getSummerRevenue(), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    await captureError('Summer revenue read failed', error, {
      route: '/api/internal/ovie/summer-company/revenue',
    });
    return NextResponse.json(
      { error: 'revenue_unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
