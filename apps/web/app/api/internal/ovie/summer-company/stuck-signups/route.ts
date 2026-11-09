import { NextResponse } from 'next/server';
import { listStuckSignupReplays } from '@/lib/analytics/signup-replay.server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;

/**
 * Accounts that signed up but have not claimed a profile, each with the
 * Sentry replays recorded for that user. Lets Summer link "watch this
 * session" in stuck-signup advice. Internal ids and Sentry URLs only; the
 * URLs need a Sentry login.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  const days = Number(new URL(request.url).searchParams.get('days'));
  const windowDays =
    Number.isInteger(days) && days > 0
      ? Math.min(days, MAX_DAYS)
      : DEFAULT_DAYS;
  try {
    const signups = await listStuckSignupReplays(windowDays);
    return NextResponse.json(
      {
        contract: 'summer-stuck-signups/v1',
        windowDays,
        signups,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Summer stuck-signups read failed', error, {
      route: '/api/internal/ovie/summer-company/stuck-signups',
    });
    return NextResponse.json(
      { error: 'stuck_signups_unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
