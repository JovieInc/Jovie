import { NextResponse } from 'next/server';
import { loadStreamDeliverability } from '@/lib/email/stream-deliverability.server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';

/**
 * Per-domain, per-stream bounce and complaint rates over 7 days, from the
 * Resend webhook outcomes. Summer reads this; it never carries recipient data.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  try {
    return NextResponse.json(await loadStreamDeliverability(), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    await captureError('Email deliverability read failed', error);
    return NextResponse.json(
      { error: 'Deliverability unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
