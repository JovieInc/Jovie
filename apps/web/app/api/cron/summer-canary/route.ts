/**
 * Summer fast-chat canary. Called hourly by .github/workflows/ovie-summer-canary.yml
 * with the cron bearer secret. Stateless: nothing lands in the founder's history.
 */
import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { runSummerCanary } from '@/lib/ovie/summer-canary';
import { founderPrincipalHash } from '@/lib/ovie/summer-founder-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/summer-canary',
  });
  if (authError) return authError;

  const founderUserId = env.OVIE_SUMMER_FOUNDER_APP_USER_ID?.trim();
  if (!founderUserId) {
    return NextResponse.json(
      { ok: false, code: 'founder_unconfigured' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
  const result = await runSummerCanary({
    principalHash: founderPrincipalHash(founderUserId),
  });
  if (!result.ok) {
    await captureError(
      'Summer canary failed',
      new Error(`summer_canary_failed:${result.code}`),
      { feature: 'ovie-summer', code: result.code }
    ).catch(() => undefined);
    return NextResponse.json(result, {
      status: 503,
      headers: NO_STORE_HEADERS,
    });
  }
  return NextResponse.json(result, { headers: NO_STORE_HEADERS });
}
