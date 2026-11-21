/**
 * Dogfood account truth probe (JOV-7140). Called daily by
 * .github/workflows/dogfood-truth.yml with the cron bearer secret. Read only:
 * it reports findings and the workflow files or resolves one Linear issue per
 * finding key. Always 200 when the check ran; `ok` carries the verdict.
 */
import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { checkDesignPartnerAccountTruth } from '@/lib/dogfood/account-truth';
import { captureError } from '@/lib/error-tracking';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/dogfood-truth',
  });
  if (authError) return authError;

  try {
    const report = await checkDesignPartnerAccountTruth();
    return NextResponse.json(report, { headers: NO_STORE_HEADERS });
  } catch (error) {
    await captureError('Dogfood account truth probe failed', error, {
      feature: 'dogfood-truth',
    }).catch(() => undefined);
    return NextResponse.json(
      { ok: false, code: 'probe_failed' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
